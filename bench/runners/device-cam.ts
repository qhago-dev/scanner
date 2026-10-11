// Cámara simulada sobre `device`: cada foto real se repite como un vídeo quieto (15 fps, `--seconds`), con la
// sesión real (tracker + fusión + barrido + deblur), descartando frames si el motor está ocupado y con el
// tiempo de proceso multiplicado por `--slowdown` (≈ 10 para el Android de las pruebas).
// bun run runners/device-cam.ts --split dev [--slowdown 10] [--seconds 1.5]
import { parseArgs } from "node:util";
import { FORMATS } from "@qhago/scanner";
import { configure } from "../../packages/scanner/src/config";
import { loadEngine } from "../../packages/scanner/src/engine/load-node";
import { toRaster } from "../../packages/scanner/src/input/node";
import { ScannerSession } from "../../packages/scanner/src/scanner/session";
import { loadManifest } from "../dataset/manifest";
import { loadRgba } from "../image";

const { values: a } = parseArgs({
  options: {
    split: { type: "string", default: "dev" },
    slowdown: { type: "string", default: "10" },
    seconds: { type: "string", default: "1.5" },
  },
});
configure({
  wasmUrl: new URL("../../packages/scanner/wasm/qhago_engine_node.wasm", import.meta.url),
});
const SLOW = Number(a.slowdown);
const DUR = Number(a.seconds) * 1000;
const norm = (t: string) => t.replace(/^0+/, "");
const tally: Record<string, { ok: number; n: number; t: number[] }> = {};
const falses: string[] = [];
for (const s of loadManifest("device").filter((x) => x.split === a.split)) {
  const img = loadRgba(s.path);
  const reads: { text: string; at: number }[] = [];
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
      if (e.type === "detect") reads.push({ text: e.result.text, at: -1 });
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
  const want = s.codes[0]?.text;
  const hit = reads.find((x) => want && norm(x.text) === norm(want));
  if (hit) {
    c.ok++;
    c.t.push(hit.at);
  }
  for (const x of reads) if (!want || norm(x.text) !== norm(want)) falses.push(`${s.id}=${x.text}`);
}
const med = (v: number[]) => (v.length ? v.sort((x, y) => x - y)[v.length >> 1]?.toFixed(0) : "—");
console.log(
  Object.entries(tally)
    .map(([k, v]) => `${k} ${v.ok}/${v.n} (lee en p50 ${med(v.t)} ms)`)
    .join(" · "),
  `· falsas ${falses.length}`,
  falses.join(", "),
);
