// F6.3/F6.6 e2e (bun test e2e): la librería servida desde otro origen (CDN con CORS) bajo una CSP estricta.
// Requiere `bun run build` antes. Origen A = la app; origen B = "CDN" con dist/.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { type Browser, chromium } from "playwright";

const PKG = join(import.meta.dir, "..");
const TYPES: Record<string, string> = {
  js: "text/javascript",
  mjs: "text/javascript",
  wasm: "application/wasm",
  png: "image/png",
  html: "text/html",
};
let browser: Browser;
let cdn: ReturnType<typeof Bun.serve>;
let app: ReturnType<typeof Bun.serve>;

const page = '<!doctype html><meta charset="utf-8"><script type="module" src="/app.js"></script>';
const appJs = (cdnUrl: string) => `import { decode } from "${cdnUrl}/dist/browser/index.js";
try {
  const blob = await (await fetch("/fixture.png")).blob();
  const r = await decode(blob, { formats: ["ean_13"] });
  window.__result = { ok: true, text: r[0]?.text };
} catch (e) {
  window.__result = { ok: false, code: e.code, message: String(e.message) };
}
`;

function csp(cdnUrl: string, workerSrc: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval' ${cdnUrl}`,
    `worker-src ${workerSrc}`,
    `connect-src 'self' ${cdnUrl}`,
    "style-src 'self'",
  ].join("; ");
}

beforeAll(async () => {
  cdn = Bun.serve({
    port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname;
      const file = Bun.file(join(PKG, path));
      if (!(await file.exists())) return new Response("404", { status: 404 });
      return new Response(file, {
        headers: {
          "content-type": TYPES[path.split(".").pop() ?? ""] ?? "application/octet-stream",
          "access-control-allow-origin": "*",
        },
      });
    },
  });
  const cdnUrl = `http://127.0.0.1:${cdn.port}`;
  app = Bun.serve({
    port: 0,
    fetch(req) {
      const u = new URL(req.url);
      if (u.pathname === "/fixture.png")
        return new Response(Bun.file(join(PKG, "test/fixtures/ean13-synthetic.png")));
      if (u.pathname === "/app.js")
        return new Response(appJs(cdnUrl), { headers: { "content-type": "text/javascript" } });
      // Los imports del worker módulo se comprueban contra worker-src: el CDN también debe estar ahí.
      const worker = (u.searchParams.get("worker") ?? "'self' blob: CDN").replace("CDN", cdnUrl);
      const headers: Record<string, string> = { "content-type": "text/html" };
      if (!u.searchParams.has("nocsp")) headers["content-security-policy"] = csp(cdnUrl, worker);
      return new Response(page, { headers });
    },
  });
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  cdn?.stop(true);
  app?.stop(true);
});

async function run(
  query = "",
): Promise<{ ok: boolean; text?: string; code?: string; message?: string }> {
  const p = await browser.newPage();
  const violations: string[] = [];
  p.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
  });
  await p.goto(`http://127.0.0.1:${app.port}/${query}`);
  await p.waitForFunction(() => (window as { __result?: unknown }).__result, null, {
    timeout: 30_000,
  });
  const r = await p.evaluate(() => (window as unknown as { __result: never }).__result);
  await p.close();
  return { ...(r as object), violations } as never;
}

describe("CDN + CSP estricta", () => {
  it("control: sin CSP", async () => {
    const r = await run("?nocsp=1");
    if (!r.ok) console.log(JSON.stringify(r));
    expect(r).toMatchObject({ ok: true, text: "5901234123457" });
  }, 60_000);

  it("decode() funciona desde otro origen sin 'unsafe-eval' (solo 'wasm-unsafe-eval'), worker-src 'self' blob: <cdn>", async () => {
    const r = await run();
    if (!r.ok) console.log(JSON.stringify(r));
    expect(r).toMatchObject({ ok: true, text: "5901234123457" });
  }, 60_000);

  it("sin blob: en worker-src → ENGINE_LOAD_FAILED con la pista de CSP/CDN", async () => {
    const r = await run("?worker='self'");
    expect(r.ok).toBe(false);
    expect(r.code).toBe("ENGINE_LOAD_FAILED");
    expect(r.message).toMatch(/worker-src|workerUrl|worker: false/);
  }, 60_000);
});
