// Evaluación rápida sobre `device` (fotos reales con veredicto manual): lecturas por clase, falsas con detalle.
// bun run device-eval.ts [--split dev|test] [--engines qhago-fast,qhago,qhago+ai] [--json out.json]
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { qhagoEngine } from "./engines/qhago";
import { qhagoAiEngine } from "./engines/qhago-ai";
import type { Engine } from "./engines/types";
import { zxingWasmEngine } from "./engines/zxing-wasm";
import { loadRgba } from "./image";
import { loadManifest } from "./dataset/manifest";

const { values: a } = parseArgs({
  options: {
    split: { type: "string", default: "dev" },
    engines: { type: "string", default: "qhago-fast,qhago,qhago+ai" },
    json: { type: "string" },
  },
});
const ENGINES: Record<string, () => Engine> = {
  "qhago-fast": () => qhagoEngine("fast"),
  qhago: () => qhagoEngine("balanced"),
  "qhago-thorough": () => qhagoEngine("thorough"),
  "qhago+ai": () => qhagoAiEngine(),
  "zxing-wasm": zxingWasmEngine,
};
const norm = (t: string) => t.replace(/^0+/, "");
const samples = loadManifest("device").filter((s) => s.split === a.split);
const names = (a.engines ?? "").split(",");
const detail: Record<string, Record<string, { got: string[]; ms: number }>> = {};
for (const n of names) {
  const e = ENGINES[n]?.();
  if (!e) throw new Error(`motor desconocido ${n}`);
  await e.init();
  detail[n] = {};
  for (const s of samples) {
    const rgba = loadRgba(s.path);
    const t = performance.now();
    const r = await e.decode({ rgba });
    detail[n][s.id] = { got: r.map((x) => x.text), ms: performance.now() - t };
  }
}
for (const n of names) {
  const row: string[] = [];
  const falses: string[] = [];
  for (const cls of ["legible", "dudosa", "sin-codigo"]) {
    const ss = samples.filter((s) => s.scenarios[0] === cls);
    const ok = ss.filter((s) => {
      const want = s.codes[0]?.text;
      return want && detail[n]?.[s.id]?.got.some((g) => norm(g) === norm(want));
    }).length;
    row.push(`${cls} ${ok}/${ss.length}`);
  }
  for (const s of samples) {
    const want = new Set(s.codes.map((c) => norm(c.text)));
    const bad = (detail[n]?.[s.id]?.got ?? []).filter((g) => !want.has(norm(g)));
    if (bad.length) falses.push(`${s.id}=${bad.join("/")}`);
  }
  const ms = Object.values(detail[n] ?? {}).map((d) => d.ms).sort((x, y) => x - y);
  const p = (q: number) => ms[Math.min(ms.length - 1, Math.floor(q * ms.length))]?.toFixed(0);
  console.log(
    `${n.padEnd(16)} ${row.join(" · ")} · falsas ${falses.length} · p50 ${p(0.5)} ms p95 ${p(0.95)} ms`,
  );
  if (falses.length) console.log(`   falsas: ${falses.join(", ")}`);
}
if (a.json) writeFileSync(a.json, JSON.stringify(detail));
