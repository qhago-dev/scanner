// Evaluación rápida sobre `device` (fotos reales con veredicto manual): lecturas por clase, falsas con detalle.
// bun run device-eval.ts [--split dev|test] [--engines qhago-fast,qhago,qhago+ai] [--json out.json] [--reason …]
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadManifest } from "./dataset/manifest";
import { qhagoEngine } from "./engines/qhago";
import { qhagoAiEngine } from "./engines/qhago-ai";
import type { Detected, Engine } from "./engines/types";
import { zxingWasmEngine } from "./engines/zxing-wasm";
import { guardSplit } from "./guard";
import { loadRgba } from "./image";
import { equivalent, scoreSample } from "./metrics";

const { values: a } = parseArgs({
  options: {
    split: { type: "string", default: "dev" },
    engines: { type: "string", default: "qhago-fast,qhago,qhago+ai" },
    json: { type: "string" },
    reason: { type: "string" },
    "holdout-ok": { type: "boolean", default: false },
  },
});
guardSplit({
  split: a.split ?? "dev",
  reason: a.reason,
  holdoutOk: a["holdout-ok"],
  runner: "device-eval",
  dataset: "device",
  engines: a.engines ?? "",
  out: join(import.meta.dir, "results"),
});
const ENGINES: Record<string, () => Engine> = {
  "qhago-fast": () => qhagoEngine("fast"),
  qhago: () => qhagoEngine("balanced"),
  "qhago-thorough": () => qhagoEngine("thorough"),
  "qhago+ai": () => qhagoAiEngine(),
  "qhago+ai+deblur": () => qhagoAiEngine(undefined, "fallback", true),
  "zxing-wasm": zxingWasmEngine,
};
const samples = loadManifest("device").filter((s) => s.split === a.split);
const names = (a.engines ?? "").split(",");
const detail: Record<string, Record<string, { got: Detected[]; ms: number }>> = {};
for (const n of names) {
  const e = ENGINES[n]?.();
  if (!e) throw new Error(`motor desconocido ${n}`);
  await e.init();
  detail[n] = {};
  for (const s of samples) {
    const rgba = loadRgba(s.path);
    const t = performance.now();
    const r = await e.decode({ rgba });
    detail[n][s.id] = {
      got: r.map((x) => ({ format: x.format, text: x.text })),
      ms: performance.now() - t,
    };
  }
}
for (const n of names) {
  const row: string[] = [];
  const falses: string[] = [];
  // Misma puntuación que el resto del bench (equivalent(): GTIN-13 para EAN/UPC, texto exacto para el resto).
  const score = (s: (typeof samples)[number]) =>
    scoreSample({ sample: s, detected: detail[n]?.[s.id]?.got ?? [], ms: 0 });
  for (const cls of ["legible", "dudosa", "sin-codigo"]) {
    const ss = samples.filter((s) => s.scenarios[0] === cls);
    const ok = ss.filter((s) => score(s).allFound).length;
    row.push(`${cls} ${ok}/${ss.length}`);
  }
  for (const s of samples) {
    if (score(s).falseReads === 0) continue;
    const bad = (detail[n]?.[s.id]?.got ?? []).filter(
      (g) => !s.codes.some((c) => equivalent(c, g)),
    );
    falses.push(`${s.id}=${bad.map((g) => g.text).join("/")}`);
  }
  const ms = Object.values(detail[n] ?? {})
    .map((d) => d.ms)
    .sort((x, y) => x - y);
  const p = (q: number) => ms[Math.min(ms.length - 1, Math.floor(q * ms.length))]?.toFixed(0);
  console.log(
    `${n.padEnd(16)} ${row.join(" · ")} · falsas ${falses.length} · p50 ${p(0.5)} ms p95 ${p(0.95)} ms`,
  );
  if (falses.length) console.log(`   falsas: ${falses.join(", ")}`);
}
if (a.json) writeFileSync(a.json, JSON.stringify(detail));
