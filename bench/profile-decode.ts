// Perfilado de decode() por etapa (F10.7): dónde está la cola de latencia.
// bun run profile-decode.ts --dataset public --split dev [--limit N] [--json out.json]
// Etapas (mismo orden que decodeInline sin plugins): cascada (readRaster con noVerify), verifyHarder (diferencia
// readRaster − cascada), deblurCrossCheck, deblurFallback. Solo split dev (no hay guarda: no toca test).
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { FORMATS } from "@qhago/scanner";
import { configure } from "../packages/scanner/src/config";
import { deblurCrossCheck, deblurFallback, readRaster } from "../packages/scanner/src/core";
import { loadEngine } from "../packages/scanner/src/engine/load-node";
import { toRaster } from "../packages/scanner/src/input/node";
import { loadManifest } from "./dataset/manifest";
import { loadRgba } from "./image";

const { values: a } = parseArgs({
  options: {
    dataset: { type: "string", default: "public" },
    split: { type: "string", default: "dev" },
    limit: { type: "string" },
    json: { type: "string" },
  },
});
if (a.split !== "dev") {
  console.error("profile-decode solo sobre dev");
  process.exit(2);
}
configure({
  wasmUrl: new URL("../packages/scanner/wasm/qhago_engine_node.wasm", import.meta.url),
});
const engine = await loadEngine();
const all = loadManifest(a.dataset ?? "public").filter((s) => s.split === "dev");
const samples = a.limit ? all.slice(0, Number(a.limit)) : all;
const opts = { formats: FORMATS, strategy: "balanced" as const };
const STAGES = ["cascada", "verify", "crossCheck", "fallback", "total"] as const;
const rows: Record<(typeof STAGES)[number] | "id", number | string>[] = [];
for (const [i, s] of samples.entries()) {
  const img = loadRgba(s.path);
  const raster = await toRaster({ ...img, format: "rgba" }, engine);
  let t = performance.now();
  readRaster(engine, raster, { ...opts, noVerify: true });
  const cascada = performance.now() - t;
  t = performance.now();
  const full = readRaster(engine, raster, opts);
  const verify = Math.max(0, performance.now() - t - cascada);
  t = performance.now();
  const checked = deblurCrossCheck(raster, full.results, opts);
  const crossCheck = performance.now() - t;
  t = performance.now();
  deblurFallback(raster, checked, opts);
  const fallback = performance.now() - t;
  rows.push({
    id: s.id,
    cascada,
    verify,
    crossCheck,
    fallback,
    total: cascada + verify + crossCheck + fallback,
  });
  if ((i + 1) % 200 === 0) console.error(`  ${i + 1}/${samples.length}`);
}
const q = (v: number[], p: number) => {
  const x = [...v].sort((m, n) => m - n);
  return x[Math.min(x.length - 1, Math.ceil((p / 100) * x.length) - 1)] ?? Number.NaN;
};
const tot = rows.map((r) => r.total as number);
const p95 = q(tot, 95);
const tail = rows.filter((r) => (r.total as number) >= p95);
console.log(`# Perfil de decode() — ${a.dataset}/dev (${rows.length} muestras)\n`);
console.log("| Etapa | p50 ms | p95 ms | p99 ms | media en la cola (≥ p95 total) | % de la cola |");
console.log("|---|---|---|---|---|---|");
const tailSum = tail.reduce((s, r) => s + (r.total as number), 0);
for (const st of STAGES) {
  const v = rows.map((r) => r[st] as number);
  const tv = tail.reduce((s, r) => s + (r[st] as number), 0);
  console.log(
    `| ${st} | ${q(v, 50).toFixed(1)} | ${q(v, 95).toFixed(1)} | ${q(v, 99).toFixed(1)} | ${(tv / Math.max(1, tail.length)).toFixed(1)} | ${((tv / Math.max(1e-9, tailSum)) * 100).toFixed(0)} % |`,
  );
}
if (a.json) writeFileSync(a.json, JSON.stringify(rows));
