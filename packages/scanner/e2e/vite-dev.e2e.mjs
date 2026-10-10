// F6.3 e2e (node --test): Vite dev. Con pre-bundling el paquete se reubica en .vite/deps y new URL(…, import.meta.url)
// deja de apuntar al .wasm: el error debe traer la pista de optimizeDeps.exclude (ADR-06). Excluido, funciona.
// Vite corre en Node (en Bun el servidor de desarrollo pierde la conexión).
import assert from "node:assert/strict";
import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "vite-app");
let browser;

before(async () => {
  copyFileSync(join(HERE, "../test/fixtures/ean13-synthetic.png"), join(ROOT, "fixture.png"));
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});

async function withServer(exclude) {
  const server = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: "silent",
    cacheDir: join(ROOT, `.vite-${exclude ? "ex" : "pre"}`),
    server: { port: 0 },
    optimizeDeps: exclude
      ? { exclude: ["@qhago/scanner"] }
      : { include: ["@qhago/scanner"], force: true },
    worker: { format: "es" },
  });
  await server.listen();
  try {
    const p = await browser.newPage();
    await p.goto(server.resolvedUrls.local[0]);
    await p.waitForFunction(() => window.__result, null, { timeout: 60_000 });
    return await p.evaluate(() => window.__result);
  } finally {
    await server.close();
  }
}

test("Vite dev con optimizeDeps.exclude: decode() funciona", { timeout: 120_000 }, async () => {
  const r = await withServer(true);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.text, "5901234123457");
});

test("Vite dev con pre-bundling: ENGINE_LOAD_FAILED con la pista de optimizeDeps", {
  timeout: 120_000,
}, async () => {
  const r = await withServer(false);
  if (r.ok) return; // si Vite deja de reubicar el paquete, mejor
  assert.equal(r.code, "ENGINE_LOAD_FAILED");
  assert.match(r.message, /optimizeDeps/);
});
