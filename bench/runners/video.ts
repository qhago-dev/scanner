// Benchmark de vídeo (F1/F3, gate G3) en tiempo real simulado:
// los frames llegan a su FPS; si el motor está ocupado, el frame se descarta (como en una cámara).
// qhago usa su sesión real (tracker + fusión multi-frame); el resto decodifica frame a frame.
// Uso: bun run runners/video.ts --dataset synthetic-video --split dev [--engines qhago,zxing-wasm,zxing-js] [--reason …]
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
import { equivalent, pairedBootstrap, recallMetric, type SampleRun, verdict } from "../metrics";

const { values: a } = parseArgs({
  options: {
    dataset: { type: "string", default: "synthetic-video" },
    split: { type: "string", default: "dev" },
    engines: { type: "string", default: "qhago,zxing-wasm,zxing-js" },
    reason: { type: "string" },
    out: { type: "string", default: join(import.meta.dir, "../results") },
  },
});
if (a.split === "test" && !a.reason) {
  console.error("--split test exige --reason");
  process.exit(2);
}
configure({
  wasmUrl: new URL("../../packages/scanner/wasm/qhago_engine_node.wasm", import.meta.url),
});

interface VideoRun {
  sample: Sample;
  reads: { text: string; format: string; atMs: number }[];
  processed: number;
  dropped: number;
}

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
    busyUntil = t + r.ms;
    // Los detect emitidos durante process() se fechan cuando termina ese frame.
    for (const p of pending.splice(0)) reads.push({ ...p, atMs: busyUntil });
  }
  return { sample: s, reads, processed, dropped };
}

async function runFrameByFrame(e: Engine, s: Sample): Promise<VideoRun> {
  const v = frames(s);
  const reads: VideoRun["reads"] = [];
  let busyUntil = 0;
  let processed = 0;
  let dropped = 0;
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
    const ms = performance.now() - t0;
    processed++;
    busyUntil = t + ms;
    for (const d of det)
      if (!reads.some((r) => r.text === d.text)) reads.push({ ...d, atMs: busyUntil });
  }
  return { sample: s, reads, processed, dropped };
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
if (a.dataset !== "real")
  L.push("> **No representativo de cámaras reales**: no sirve para G3.", "");
L.push(
  "| Motor | Vídeos | % leídos | ttfr p50 ms | ttfr p95 ms | Lecturas falsas | FP en negativas | Frames procesados | Descartados |",
  "|---|---|---|---|---|---|---|---|---|",
);
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
  L.push(
    `| ${name} | ${runs.length} | ${((read / Math.max(1, pos.length)) * 100).toFixed(1)} % | ${pct(ttfr, 50).toFixed(0)} | ${pct(ttfr, 95).toFixed(0)} | ${falseReads} | ${fpNeg}/${neg.length} | ${proc} | ${drop} |`,
  );
}
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
  `${new Date().toISOString().slice(0, 10)}-${commit}-${a.dataset}-${a.split}.md`,
);
writeFileSync(file, md);
console.log(md);
