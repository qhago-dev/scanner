// Presupuesto de peso de dist/ (gzip):
//   - JS inicial (scripts y modulepreload de index.html) ≤ 60 KB.
//   - Todo lo que se descarga sin IA (JS inicial + worker + motor .wasm) ≤ 450 KB.
// Un recurso es "de IA" si es de ONNX Runtime o el modelo, o si referencia (directa o indirectamente) a uno de ellos.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = new URL("../dist/", import.meta.url).pathname;
const BUDGET_INITIAL = 60 * 1024;
const BUDGET_NO_AI = 450 * 1024;

const assets = readdirSync(join(DIST, "assets"));
const read = (f) => readFileSync(join(DIST, "assets", f));
const gz = (f) => gzipSync(read(f), { level: 9 }).length;
const text = (f) => (/\.(js|css)$/.test(f) ? read(f).toString("utf8") : "");
const refs = (f) => assets.filter((a) => a !== f && text(f).includes(a));

const ai = new Set(assets.filter((a) => /^ort[.-]|\.onnx$/.test(a)));
for (let changed = true; changed; ) {
  changed = false;
  for (const a of assets)
    if (!ai.has(a) && refs(a).some((r) => ai.has(r))) changed = ai.add(a) && true;
}

const html = readFileSync(join(DIST, "index.html"), "utf8");
const initial = [
  ...html.matchAll(
    /<(?:script[^>]+src|link[^>]+rel="modulepreload"[^>]+href)="[^"]*assets\/([^"]+)"/g,
  ),
].map((m) => m[1]);

// Lo alcanzable desde el JS inicial sin pasar por recursos de IA.
const noAi = new Set(initial);
for (const f of noAi) for (const r of refs(f)) if (!ai.has(r)) noAi.add(r);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const sum = (list) => [...list].reduce((s, f) => s + gz(f), 0);
const initialSize = sum(initial);
const noAiSize = sum(noAi);
console.log(
  `JS inicial: ${kb(initialSize)} gzip (≤ ${kb(BUDGET_INITIAL)}) — ${initial.join(", ")}`,
);
console.log(`Sin IA:     ${kb(noAiSize)} gzip (≤ ${kb(BUDGET_NO_AI)}) — ${[...noAi].join(", ")}`);
const onDemand = assets.filter((a) => !noAi.has(a) && !a.endsWith(".css"));
console.log(`IA (bajo demanda): ${kb(sum(onDemand))} gzip — ${onDemand.join(", ")}`);
if (!initial.length) throw new Error("No se encontró el JS inicial en dist/index.html");
if (initialSize > BUDGET_INITIAL || noAiSize > BUDGET_NO_AI) {
  console.error("Presupuesto de peso superado");
  process.exit(1);
}
