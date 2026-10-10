#!/usr/bin/env node
// F6.4: presupuestos de tamaño (gzip) por entry del build de navegador + WASM. Falla si alguno se pasa.
// El tamaño de un entry incluye sus chunks importados (cierre transitivo); "+core" = presupuesto propio
// sobre el cierre de `index`. Además se mide lo que paga una app típica tras tree-shaking (como size-limit).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "../dist/browser");
const KB = 1024;
const BUDGETS = [
  // Entry completo (todo exportado, incluido el glue de Emscripten, ~3,5 KB). El objetivo inicial de F4 era
  // 15 KB; se fijó en 17 KB al cerrar F6 con la API completa (scanner + plugins + diagnóstico).
  { entry: "index.js", max: 17 * KB },
  { entry: "polyfill.js", max: 3 * KB, plusCore: true },
  { entry: "quagga-compat.js", max: 3 * KB, plusCore: true },
  { entry: "ui.js", max: 8 * KB, plusCore: true },
  { entry: "parsers.js", max: 6 * KB },
  { entry: "worker.js", max: 12 * KB },
  { entry: "worker-host.js", max: 12 * KB },
  { entry: "qhago_engine.wasm", max: 450 * KB, binary: true },
];

function closure(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  const src = readFileSync(join(DIST, file), "utf8");
  // Imports estáticos (no las referencias new URL("./worker.js", …), que son otro entry).
  for (const m of src.matchAll(/(?<!URL\()["']\.\/([\w.-]+\.js)["']/g)) closure(m[1], seen);
  return seen;
}

const gz = (files) =>
  gzipSync(Buffer.concat([...files].map((f) => readFileSync(join(DIST, f)))), { level: 9 }).length;
const core = gz(closure("index.js"));
let failed = false;
const rows = [];
for (const b of BUDGETS) {
  const size = b.binary
    ? gzipSync(readFileSync(join(DIST, b.entry)), { level: 9 }).length
    : gz(closure(b.entry));
  const limit = b.plusCore ? core + b.max : b.max;
  const ok = size <= limit;
  failed ||= !ok;
  rows.push(
    `${ok ? "✔" : "✘"} ${b.entry.padEnd(20)} ${(size / KB).toFixed(1).padStart(7)} KB / ${(limit / KB).toFixed(1)} KB${b.plusCore ? ` (core + ${b.max / KB} KB)` : ""}`,
  );
}
// Escenarios con tree-shaking (lo que de verdad llega a una app).
const SCENARIOS = [
  { name: "import { decode }", code: "export { decode } from './index.js';", max: 10 * KB },
  {
    name: "import { createScanner }",
    code: "export { createScanner } from './index.js';",
    max: 15 * KB,
  },
];
for (const sc of SCENARIOS) {
  const r = await build({
    stdin: { contents: sc.code, resolveDir: DIST, loader: "js" },
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    write: false,
    logLevel: "silent",
  });
  const size = gzipSync(r.outputFiles[0].contents, { level: 9 }).length;
  const ok = size <= sc.max;
  failed ||= !ok;
  rows.push(
    `${ok ? "✔" : "✘"} ${sc.name.padEnd(28)} ${(size / KB).toFixed(1).padStart(7)} KB / ${(sc.max / KB).toFixed(1)} KB`,
  );
}
console.log(rows.join("\n"));
if (failed) {
  console.error("Presupuesto de tamaño superado (docs/roadmap-v1/fase-4-api-dx/disenio.md).");
  process.exit(1);
}
