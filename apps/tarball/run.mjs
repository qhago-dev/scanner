// F7.3: apps de ejemplo contra el TARBALL publicable (npm pack), no contra el workspace.
// Cada app se copia a un directorio temporal, instala `@qhago/scanner` desde el .tgz con npm, se compila y se
// comprueba que lee el fixture (EAN-13 5901234123457): en Node/Bun por stdout, en navegador con Playwright.
//
//   node apps/tarball/run.mjs [app…] [--keep] [--tarball ruta.tgz]
//   (antes: bun run --filter @qhago/scanner build)
import { execFileSync, spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const EXPECTED = "5901234123457";
const args = process.argv.slice(2);
const keep = args.includes("--keep");
const ti = args.indexOf("--tarball");
const only = args.filter((a, i) => !a.startsWith("--") && (ti < 0 || i !== ti + 1));

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

/** Servidor estático mínimo (con CORS opcional, como una CDN). */
function serve(dir, { cors = false, rewrite = {} } = {}) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = join(dir, rewrite[path] ?? path);
    if (existsSync(join(file, "index.html"))) file = join(file, "index.html");
    if (!file.startsWith(dir) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    const headers = { "content-type": MIME[extname(file)] ?? "application/octet-stream" };
    if (cors) headers["access-control-allow-origin"] = "*";
    res.writeHead(200, headers).end(readFileSync(file));
  });
  return new Promise((ok) =>
    server.listen(0, "127.0.0.1", () =>
      ok({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }),
    ),
  );
}

const sh = (cmd, argv, cwd, env = {}) =>
  execFileSync(cmd, argv, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

let browser;
async function inBrowser(url) {
  // Playwright es devDependency de @qhago/scanner (no está en la raíz del monorepo).
  const pw = createRequire(join(ROOT, "packages/scanner/package.json")).resolve("playwright");
  const mod = await import(pathToFileURL(pw).href);
  const chromium = mod.chromium ?? mod.default.chromium;
  browser ??= await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("requestfailed", (r) => errors.push(`${r.url()} ${r.failure()?.errorText}`));
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.__result, null, { timeout: 60_000 });
    const r = await page.evaluate(() => window.__result);
    return errors.length && !r.includes(EXPECTED) ? `${r} | ${errors.join(" | ")}` : r;
  } catch (e) {
    return `ERR: ${e.message.split("\n")[0]} | ${errors.join(" | ")}`;
  } finally {
    await page.close();
  }
}

function waitFor(url, ms = 60_000) {
  const t0 = Date.now();
  return new Promise((ok, ko) => {
    const tick = () =>
      fetch(url)
        .then(() => ok())
        .catch(() =>
          Date.now() - t0 > ms ? ko(new Error(`sin respuesta: ${url}`)) : setTimeout(tick, 500),
        );
    tick();
  });
}

/** Comprobación por app: devuelve el texto leído. */
const CHECKS = {
  "node-cli": async (d) => sh("node", ["index.mjs", "fixture.jpg"], d),
  "bun-runtime": async (d) => {
    const a = sh("bun", ["index.ts", "fixture.png"], d);
    sh("bun", ["build", "index.ts", "--target", "bun", "--outdir", "out"], d);
    // Paso documentado (pista de ENGINE_LOAD_FAILED): el .wasm va junto al bundle.
    cpSync(
      join(d, "node_modules/@qhago/scanner/wasm/qhago_engine_node.wasm"),
      join(d, "out/qhago_engine_node.wasm"),
    );
    const b = sh("bun", ["out/index.js", "fixture.png"], d);
    return `runtime ${a.trim()} · bun build ${b.trim()}`;
  },
  "vite-vanilla": async (d) => {
    sh("npm", ["run", "build", "--silent"], d);
    const s = await serve(join(d, "dist"));
    try {
      return await inBrowser(s.url);
    } finally {
      s.close();
    }
  },
  "vite-react": async (d) => CHECKS["vite-vanilla"](d),
  // Worker propio del usuario que importa la librería (Vite: formato iife por defecto, sin code-splitting).
  "vite-user-worker": async (d) => CHECKS["vite-vanilla"](d),
  webpack5: async (d) => {
    sh("npm", ["run", "build", "--silent"], d);
    writeFileSync(join(d, "dist/index.html"), '<!doctype html><script src="main.js"></script>');
    cpSync(join(d, "fixture.png"), join(d, "dist/fixture.png"));
    const s = await serve(join(d, "dist"));
    try {
      return await inBrowser(s.url);
    } finally {
      s.close();
    }
  },
  astro: async (d) => CHECKS["vite-vanilla"](d),
  "next-app-router": async (d) => {
    sh("npm", ["run", "build", "--silent"], d, { NEXT_TELEMETRY_DISABLED: "1" });
    const port = 3900 + Math.floor(Math.random() * 90);
    const p = spawn("npx", ["next", "start", "-p", String(port)], {
      cwd: d,
      stdio: "ignore",
      detached: true,
    });
    try {
      await waitFor(`http://127.0.0.1:${port}/`);
      const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
      if (!html.includes('id="formats"')) return "ERR: el server component no renderizó";
      return await inBrowser(`http://127.0.0.1:${port}/`);
    } finally {
      process.kill(-p.pid);
    }
  },
  "cdn-html": async (d) => {
    // El paquete instalado se sirve desde otro origen con CORS (como jsDelivr); la página, desde el suyo.
    const cdn = await serve(join(d, "node_modules/@qhago/scanner"), { cors: true });
    writeFileSync(
      join(d, "index.html"),
      readFileSync(join(d, "index.html"), "utf8").replaceAll("CDN_ORIGIN", cdn.url),
    );
    const site = await serve(d);
    try {
      return await inBrowser(site.url);
    } finally {
      site.close();
      cdn.close();
    }
  },
};

const tarball =
  ti >= 0
    ? resolve(args[ti + 1])
    : (() => {
        const dest = mkdtempSync(join(tmpdir(), "qhago-pack-"));
        const name = sh(
          "npm",
          ["pack", "--silent", "--pack-destination", dest],
          join(ROOT, "packages/scanner"),
        ).trim();
        return join(dest, name.split("\n").pop());
      })();
console.log(`tarball: ${tarball}`);
const work = mkdtempSync(join(tmpdir(), "qhago-examples-"));
const apps = Object.keys(CHECKS).filter((a) => !only.length || only.includes(a));
const rows = [];
for (const app of apps) {
  const d = join(work, app);
  const t0 = Date.now();
  let got;
  try {
    cpSync(join(HERE, app), d, { recursive: true });
    for (const f of ["fixture.png", "fixture.jpg"]) {
      cpSync(join(HERE, f), join(d, f));
      if (existsSync(join(d, "public"))) cpSync(join(HERE, f), join(d, "public", f));
    }
    const pj = join(d, "package.json");
    writeFileSync(pj, readFileSync(pj, "utf8").replace("QHAGO_TARBALL", `file:${tarball}`));
    sh("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], d);
    got = await CHECKS[app](d);
  } catch (e) {
    got = `ERR: ${String(e.stderr || e.message)
      .trim()
      .split("\n")
      .slice(-6)
      .join(" ⏎ ")}`;
  }
  const ok = got.includes(EXPECTED) && !got.includes("ERR");
  rows.push({ app, ok, got: got.trim(), s: Math.round((Date.now() - t0) / 1000) });
  console.log(`${ok ? "OK  " : "FAIL"} ${app} (${rows.at(-1).s} s): ${got.trim().slice(0, 400)}`);
}
await browser?.close();
if (!keep) rmSync(work, { recursive: true, force: true });
else console.log(`apps en ${work}`);
mkdirSync(join(HERE, "results"), { recursive: true });
writeFileSync(join(HERE, "results/last.json"), JSON.stringify({ tarball, rows }, null, 2));
process.exit(rows.every((r) => r.ok) ? 0 : 1);
