// Micro-benchmarks (F6.4). bun run micro.ts [--save base.json] [--compare base.json]
//  - Presupuesto del diseño de F6: decode 1280×720 sin código, "fast": p50 ≤ 1,2 × zxing-wasm (mismo proceso).
//  - --compare: falla si algún caso es > 15 % más lento que la línea base (p. ej. guardada desde main).
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { decode, FORMATS, init } from "@qhago/scanner";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { loadRgba } from "./image";

const { values: a } = parseArgs({
  options: {
    save: { type: "string" },
    compare: { type: "string" },
    n: { type: "string", default: "40" },
  },
});
const N = Number(a.n);

function blank(w: number, h: number) {
  const data = new Uint8ClampedArray(w * h * 4);
  // Ruido suave tipo sensor (sin códigos): evita el atajo de imagen constante.
  let s = 12345;
  for (let i = 0; i < w * h; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    const v = 110 + ((s >>> 24) % 40);
    data.set([v, v, v, 255], i * 4);
  }
  return { data, width: w, height: h };
}

async function p50(fn: () => Promise<unknown>): Promise<number> {
  for (let i = 0; i < 3; i++) await fn();
  const t: number[] = [];
  for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    await fn();
    t.push(performance.now() - t0);
  }
  t.sort((x, y) => x - y);
  return t[Math.floor(t.length / 2)] as number;
}

await init();
const require = createRequire(import.meta.url);
const zpkg = require.resolve("zxing-wasm/package.json");
await prepareZXingModule({
  overrides: { wasmBinary: readFileSync(join(dirname(zpkg), "dist/reader/zxing_reader.wasm")) },
  fireImmediately: true,
});

const img720 = blank(1280, 720);
const ean = await loadRgba(
  new URL("../packages/scanner/test/fixtures/ean13-synthetic.png", import.meta.url).pathname,
);
const raw = (i: { data: Uint8ClampedArray; width: number; height: number }) => ({
  ...i,
  format: "rgba" as const,
});

const cases: Record<string, () => Promise<unknown>> = {
  "qhago fast 1280×720 vacío": () => decode(raw(img720), { formats: FORMATS, strategy: "fast" }),
  "zxing-wasm 1280×720 vacío": () =>
    readBarcodes({ ...img720, colorSpace: "srgb" } as unknown as ImageData, {
      tryHarder: false,
      tryRotate: false,
      tryInvert: false,
      tryDownscale: true,
    }),
  "qhago balanced 1280×720 vacío": () =>
    decode(raw(img720), { formats: FORMATS, strategy: "balanced" }),
  "qhago balanced EAN-13": () => decode(raw(ean), { formats: FORMATS, strategy: "balanced" }),
};
const res: Record<string, number> = {};
for (const [k, fn] of Object.entries(cases)) res[k] = await p50(fn);
for (const [k, v] of Object.entries(res)) console.log(`${k.padEnd(32)} p50 ${v.toFixed(2)} ms`);

let failed = false;
const ratio =
  (res["qhago fast 1280×720 vacío"] as number) / (res["zxing-wasm 1280×720 vacío"] as number);
console.log(`ratio qhago fast / zxing-wasm = ${ratio.toFixed(2)} (presupuesto ≤ 1,20)`);
if (ratio > 1.2) failed = true;
if (a.save) writeFileSync(a.save, JSON.stringify(res, null, 2));
if (a.compare) {
  const base = JSON.parse(readFileSync(a.compare, "utf8")) as Record<string, number>;
  for (const [k, v] of Object.entries(res)) {
    const b = base[k];
    if (b && v > b * 1.15) {
      console.error(
        `✘ ${k}: ${v.toFixed(2)} ms vs base ${b.toFixed(2)} ms (+${((v / b - 1) * 100).toFixed(0)} %)`,
      );
      failed = true;
    }
  }
}
process.exit(failed ? 1 : 0);
