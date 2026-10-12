// Cámara simulada sobre `device`: cada foto real se repite como un vídeo quieto (15 fps, `--seconds`), con la
// sesión real (tracker + fusión + barrido + deblur), descartando frames si el motor está ocupado y con el
// tiempo de proceso multiplicado por `--slowdown` (≈ 10 para el Android de las pruebas).
// bun run runners/device-cam.ts --split dev [--slowdown 10] [--seconds 1.5] [--only <sesión>] [--reason …]
import { join } from "node:path";
import { parseArgs } from "node:util";
import { FORMATS } from "@qhago/scanner";
import { configure } from "../../packages/scanner/src/config";
import { loadEngine } from "../../packages/scanner/src/engine/load-node";
import { toRaster } from "../../packages/scanner/src/input/node";
import { ScannerSession } from "../../packages/scanner/src/scanner/session";
import { loadManifest } from "../dataset/manifest";
import type { Detected } from "../engines/types";
import { guardSplit } from "../guard";
import { loadRgba } from "../image";
import { equivalent } from "../metrics";

const { values: a } = parseArgs({
  options: {
    split: { type: "string", default: "dev" },
    slowdown: { type: "string", default: "10" },
    seconds: { type: "string", default: "1.5" },
    only: { type: "string", default: "" },
    reason: { type: "string" },
    "holdout-ok": { type: "boolean", default: false },
  },
});
guardSplit({
  split: a.split ?? "dev",
  reason: a.reason,
  holdoutOk: a["holdout-ok"],
  runner: `device-cam x${a.slowdown}`,
  dataset: "device",
  engines: "qhago (sesión)",
  out: join(import.meta.dir, "../results"),
});
configure({
  wasmUrl: new URL("../../packages/scanner/wasm/qhago_engine_node.wasm", import.meta.url),
});
const SLOW = Number(a.slowdown);
const DUR = Number(a.seconds) * 1000;
const tally: Record<string, { ok: number; n: number; t: number[] }> = {};
const falses: string[] = [];
const missed: string[] = [];
for (const s of loadManifest("device").filter(
  (x) => x.split === a.split && x.path.includes(a.only ?? ""),
)) {
  const img = loadRgba(s.path);
  const reads: { format: Detected["format"]; text: string; at: number }[] = [];
  const session = new ScannerSession(
    {
      formats: FORMATS,
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
      if (e.type === "detect") reads.push({ format: e.result.format, text: e.result.text, at: -1 });
    },
  );
  let busy = 0;
  for (let t = 0; t < DUR; t += 1000 / 15) {
    if (t < busy) continue;
    const before = reads.length;
    const r = await session.process(
      { data: img.data, width: img.width, height: img.height, format: "rgba" },
      { ts: t, srcWidth: img.width, srcHeight: img.height },
    );
    busy = t + r.ms * SLOW;
    for (let i = before; i < reads.length; i++) (reads[i] as { at: number }).at = busy;
  }
  const cls = s.scenarios[0] as string;
  tally[cls] ??= { ok: 0, n: 0, t: [] };
  const c = tally[cls] as { ok: number; n: number; t: number[] };
  c.n++;
  // Todos los códigos esperados leídos (equivalent(): GTIN-13 para EAN/UPC); el tiempo es el del último.
  const hits = s.codes.map((c) => reads.find((x) => equivalent(c, x)));
  if (s.codes.length && hits.every(Boolean)) {
    c.ok++;
    c.t.push(Math.max(...hits.map((h) => h?.at ?? 0)));
  } else if (cls === "legible") missed.push(s.id);
  for (const x of reads)
    if (!s.codes.some((c) => equivalent(c, x))) falses.push(`${s.id}=${x.text}`);
}
const med = (v: number[]) => (v.length ? v.sort((x, y) => x - y)[v.length >> 1]?.toFixed(0) : "—");
console.log(
  Object.entries(tally)
    .map(([k, v]) => `${k} ${v.ok}/${v.n} (lee en p50 ${med(v.t)} ms)`)
    .join(" · "),
  `· falsas ${falses.length}`,
  falses.join(", "),
);
if (a.only) console.log("legibles sin leer:", missed.join(" "));
