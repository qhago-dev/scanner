// Benchmark de vídeo (F1/F3, gate G3) en tiempo real simulado:
// los frames llegan a su FPS; si el motor está ocupado, el frame se descarta (como en una cámara).
// qhago usa su sesión real (tracker + fusión multi-frame); el resto decodifica frame a frame.
// Uso: bun run runners/video.ts --dataset synthetic-video --split dev [--engines qhago,zxing-wasm,zxing-js] [--reason …] [--holdout-ok]
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { configure } from "../../packages/scanner/src/config";
import { loadEngine } from "../../packages/scanner/src/engine/load-node";
import { toRaster } from "../../packages/scanner/src/input/node";
import { ScannerSession } from "../../packages/scanner/src/scanner/session";
import { loadManifest, type Sample } from "../dataset/manifest";
import type { Engine } from "../engines/types";
import { zxingJsEngine } from "../engines/zxing-js";
import { zxingWasmEngine } from "../engines/zxing-wasm";
import { guardSplit } from "../guard";
import {
  equivalent,
  pairedBootstrap,
  recallMetric,
  type SampleRun,
  upper95,
  verdict,
} from "../metrics";

const { values: a } = parseArgs({
  options: {
    dataset: { type: "string", default: "synthetic-video" },
    split: { type: "string", default: "dev" },
    engines: { type: "string", default: "qhago,zxing-wasm,zxing-js" },
    reason: { type: "string" },
    "holdout-ok": { type: "boolean", default: false },
    // Multiplica el tiempo de proceso medido (simula un equipo más lento; un Android de gama media ≈ 8-10).
    slowdown: { type: "string", default: "1" },
    out: { type: "string", default: join(import.meta.dir, "../results") },
  },
});
guardSplit({
  split: a.split ?? "dev",
  reason: a.reason,
  holdoutOk: a["holdout-ok"],
  runner: `video x${a.slowdown}`,
  dataset: a.dataset ?? "",
  engines: a.engines ?? "",
  out: a.out ?? "results",
});
const SLOW = Number(a.slowdown);
configure({
  wasmUrl: new URL("../../packages/scanner/wasm/qhago_engine_node.wasm", import.meta.url),
});

interface VideoRun {
  sample: Sample;
  reads: { text: string; format: string; atMs: number }[];
  processed: number;
  dropped: number;
  /** Coste de cada frame procesado, ya multiplicado por --slowdown (F10.6). */
  frameMs: number[];
}

/** Presupuesto por frame en el teléfono (criterio 4 de fase 9). */
const FRAME_BUDGET_MS = 150;

function frames(s: Sample): { w: number; h: number; fps: number; data: Buffer[] } {
  const [w, h] = s.resolution ?? [0, 0];
  const raw = execFileSync(
    "ffmpeg",
    ["-loglevel", "error", "-i", s.path, "-f", "rawvideo", "-pix_fmt", "gray", "-"],
    {
      maxBuffer: 1 << 30,
    },
  );
  const size = w * h;
  const data: Buffer[] = [];
  for (let o = 0; o + size <= raw.length; o += size) data.push(raw.subarray(o, o + size));
  return { w, h, fps: s.fps ?? 15, data };
}

async function runQhago(s: Sample): Promise<VideoRun> {
  const v = frames(s);
  const reads: VideoRun["reads"] = [];
  const pending: { text: string; format: string }[] = [];
  const session = new ScannerSession(
    {
      formats: undefined as never,
      strategy: "fast",
      roi: "full",
      fusion: { confirmFrames: "auto", windowMs: 1500, duplicateCooldownMs: 2000 },
      escalateAfterFrames: 3,
      maxCodes: 4,
      lostAfterMs: 500,
      validateChecksums: true,
    },
    { loadEngine, toRaster },
    (e) => {
      if (e.type === "detect") pending.push({ text: e.result.text, format: e.result.format });
    },
  );
  session.configure({ formats: (await import("@qhago/scanner")).FORMATS });
  let busyUntil = 0;
  let processed = 0;
  let dropped = 0;
  const frameMs: number[] = [];
  for (const [i, f] of v.data.entries()) {
    const t = (i * 1000) / v.fps;
    if (t < busyUntil) {
      dropped++;
      continue;
    }
    const r = await session.process(
      { data: f, width: v.w, height: v.h, format: "luma" },
      { ts: t, srcWidth: v.w, srcHeight: v.h },
    );
    processed++;
    busyUntil = t + r.ms * SLOW;
    frameMs.push(r.ms * SLOW);
    // Los detect emitidos durante process() se fechan cuando termina ese frame.
    for (const p of pending.splice(0)) reads.push({ ...p, atMs: busyUntil });
  }
  return { sample: s, reads, processed, dropped, frameMs };
}

async function runFrameByFrame(e: Engine, s: Sample): Promise<VideoRun> {
  const v = frames(s);
  const reads: VideoRun["reads"] = [];
  let busyUntil = 0;
  let processed = 0;
  let dropped = 0;
  const frameMs: number[] = [];
  const rgba = new Uint8ClampedArray(v.w * v.h * 4);
  for (const [i, f] of v.data.entries()) {
    const t = (i * 1000) / v.fps;
    if (t < busyUntil) {
      dropped++;
      continue;
    }
    for (let k = 0; k < f.length; k++) {
      const g = f[k] ?? 0;
      rgba[k * 4] = rgba[k * 4 + 1] = rgba[k * 4 + 2] = g;
      rgba[k * 4 + 3] = 255;
    }
    const t0 = performance.now();
    const det = await e.decode({ rgba: { data: rgba, width: v.w, height: v.h } });
    const ms = (performance.now() - t0) * SLOW;
    processed++;
    busyUntil = t + ms;
    frameMs.push(ms);
    for (const d of det)
      if (!reads.some((r) => r.text === d.text)) reads.push({ ...d, atMs: busyUntil });
  }
  return { sample: s, reads, processed, dropped, frameMs };
}

const samples = loadManifest(a.dataset ?? "").filter(
  (s) => s.kind === "video" && s.split === a.split,
);
const names = (a.engines ?? "").split(",");
const others: Record<string, () => Engine> = {
  "zxing-wasm": zxingWasmEngine,
  "zxing-js": zxingJsEngine,
};
const results = new Map<string, VideoRun[]>();
for (const name of names) {
  const runs: VideoRun[] = [];
  const eng = name === "qhago" ? null : others[name]?.();
  if (name !== "qhago" && !eng) throw new Error(`Motor desconocido: ${name}`);
  await eng?.init();
  for (const s of samples)
    runs.push(name === "qhago" ? await runQhago(s) : await runFrameByFrame(eng as Engine, s));
  results.set(name, runs);
  console.error(`${name}: ${runs.length} vídeos`);
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((x, y) => x - y);
  return s.length
    ? (s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] ?? Number.NaN)
    : Number.NaN;
};
const toSampleRun = (r: VideoRun): SampleRun => ({
  sample: r.sample,
  detected: r.reads.map((x) => ({ format: x.format as never, text: x.text })),
  ms: 0,
});
const L = [
  `# Benchmark de vídeo — ${a.dataset} / ${a.split}`,
  "",
  "Tiempo real simulado: frames a su FPS, descartados si el motor está ocupado. ttfr = desde `firstVisibleMs` hasta la primera lectura correcta emitida.",
  "",
];
if (SLOW !== 1) L.push(`Tiempo de proceso ×${SLOW} (equipo lento simulado).`, "");
if (a.dataset !== "real")
  L.push("> **No representativo de cámaras reales**: no sirve para G3.", "");
L.push(
  "| Motor | Vídeos | % leídos | ttfr p50 ms | ttfr p95 ms | Lecturas falsas | FP en negativas | Frames procesados | Descartados |",
  "|---|---|---|---|---|---|---|---|---|",
);
const engineAgg: Record<string, Record<string, number>> = {};
for (const [name, runs] of results) {
  const pos = runs.filter((r) => r.sample.codes.length);
  const neg = runs.filter((r) => !r.sample.codes.length);
  const ttfr: number[] = [];
  let read = 0;
  let falseReads = 0;
  for (const r of pos) {
    const exp = r.sample.codes[0];
    const ok = r.reads.find((x) => exp && equivalent(exp, x));
    if (ok && exp) {
      read++;
      ttfr.push(Math.max(0, ok.atMs - (exp.firstVisibleMs ?? 0)));
    }
    falseReads += r.reads.filter((x) => !r.sample.codes.some((c) => equivalent(c, x))).length;
  }
  const fpNeg = neg.filter((r) => r.reads.length).length;
  const proc = runs.reduce((s, r) => s + r.processed, 0);
  const drop = runs.reduce((s, r) => s + r.dropped, 0);
  const fms = runs.flatMap((r) => r.frameMs);
  engineAgg[name] = {
    videos: runs.length,
    positives: pos.length,
    readPct: (read / Math.max(1, pos.length)) * 100,
    ttfrP50: pct(ttfr, 50),
    ttfrP95: pct(ttfr, 95),
    falseReads,
    negativesWithReads: fpNeg,
    negatives: neg.length,
    processed: proc,
    dropped: drop,
    frameP50: pct(fms, 50),
    frameP95: pct(fms, 95),
    frameMax: fms.length ? Math.max(...fms) : Number.NaN,
    framesOver150Pct: fms.length
      ? (fms.filter((x) => x > FRAME_BUDGET_MS).length / fms.length) * 100
      : Number.NaN,
    falsePer1000: proc ? (falseReads / proc) * 1000 : Number.NaN,
    falsePer1000Upper: proc ? upper95(falseReads, proc) * 1000 : Number.NaN,
  };
  L.push(
    `| ${name} | ${runs.length} | ${((read / Math.max(1, pos.length)) * 100).toFixed(1)} % | ${pct(ttfr, 50).toFixed(0)} | ${pct(ttfr, 95).toFixed(0)} | ${falseReads} | ${fpNeg}/${neg.length} | ${proc} | ${drop} |`,
  );
}
L.push(
  "",
  `Coste por frame (ms × ${SLOW}; presupuesto del teléfono ${FRAME_BUDGET_MS} ms) y falsas por 1000 frames procesados (cota 95 %):`,
  "",
  "| Motor | Frame p50 | Frame p95 | Frame máx | % frames > 150 ms | Falsas / 1000 frames (cota 95 %) |",
  "|---|---|---|---|---|---|",
);
for (const [name, g] of Object.entries(engineAgg))
  L.push(
    `| ${name} | ${g.frameP50?.toFixed(0)} | ${g.frameP95?.toFixed(0)} | ${g.frameMax?.toFixed(0)} | ${g.framesOver150Pct?.toFixed(1)} % | ${g.falsePer1000?.toFixed(2)} (≤ ${g.falsePer1000Upper?.toFixed(2)}) |`,
  );
const base = results.get("qhago");
if (base) {
  L.push("", "| vs | Δ % leídos (qhago − otro) | IC 95 % | Veredicto |", "|---|---|---|---|");
  for (const [name, runs] of results) {
    if (name === "qhago") continue;
    const d = pairedBootstrap(base.map(toSampleRun), runs.map(toSampleRun), recallMetric);
    L.push(
      `| ${name} | ${(d.diff * 100).toFixed(1)} pp | [${(d.lo * 100).toFixed(1)}, ${(d.hi * 100).toFixed(1)}] | ${verdict(d)} |`,
    );
  }
}
const md = `${L.join("\n")}\n`;
mkdirSync(a.out ?? "results", { recursive: true });
const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
const file = join(
  a.out ?? "results",
  `${new Date().toISOString().slice(0, 10)}-${commit}-${a.dataset}-${a.split}${SLOW !== 1 ? `-x${SLOW}` : ""}.md`,
);
writeFileSync(file, md);
// Detalle por vídeo (para comparar cambios vídeo a vídeo).
const detail = Object.fromEntries(
  [...results].map(([name, runs]) => [
    name,
    runs.map((r) => {
      const exp = r.sample.codes[0];
      const ok = r.reads.find((x) => exp && equivalent(exp, x));
      return {
        id: r.sample.id,
        read: !!ok,
        ttfrMs: ok && exp ? Math.max(0, ok.atMs - (exp.firstVisibleMs ?? 0)) : null,
        processed: r.processed,
        dropped: r.dropped,
      };
    }),
  ]),
);
writeFileSync(
  file.replace(/\.md$/, ".json"),
  `${JSON.stringify(
    {
      meta: {
        kind: "video",
        dataset: a.dataset,
        split: a.split,
        slowdown: SLOW,
        commit,
        date: new Date().toISOString().slice(0, 10),
      },
      engines: engineAgg,
      detail,
    },
    null,
    1,
  )}\n`,
);
console.log(md);
