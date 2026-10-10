// F6.5: propiedades con fast-check (1 000 casos en PR). La API pública nunca lanza algo que no sea ScanError,
// los parsers nunca lanzan y las transformaciones geométricas son finitas.
import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import type { Engine } from "../../src/engine/engine";
import { loadEngine } from "../../src/engine/load-node";
import { encodeOptions } from "../../src/engine/options";
import { FORMATS } from "../../src/formats";
import { mapPoints } from "../../src/geometry";
import { decode, isScanError } from "../../src/index.node";
import { parseAAMVA, parseGS1, parseISO15434, parseQRContent } from "../../src/parsers";

const RUNS = Number(process.env.FC_RUNS ?? 1000);
let engine: Engine;
beforeAll(async () => {
  engine = await loadEngine();
});

const rawImage = fc
  .record({
    w: fc.integer({ min: 1, max: 96 }),
    h: fc.integer({ min: 1, max: 96 }),
    rgba: fc.boolean(),
    seed: fc.integer(),
  })
  .map(({ w, h, rgba, seed }) => {
    const data = new Uint8Array(w * h * (rgba ? 4 : 1));
    let s = seed >>> 0;
    for (let i = 0; i < data.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      data[i] = s >>> 24;
    }
    return { data, width: w, height: h, format: rgba ? ("rgba" as const) : ("luma" as const) };
  });

const options = fc.record(
  {
    formats: fc.subarray([...FORMATS], { minLength: 0 }),
    strategy: fc.constantFrom("fast", "balanced", "thorough", "bogus"),
    maxSymbols: fc.oneof(fc.integer({ min: -5, max: 300 }), fc.constant(Number.NaN)),
    timeBudgetMs: fc.constant(30),
    validateChecksums: fc.constantFrom(true, false, "strict"),
    region: fc.record({
      x: fc.integer({ min: -10, max: 120 }),
      y: fc.integer({ min: -10, max: 120 }),
      width: fc.integer({ min: -5, max: 200 }),
      height: fc.integer({ min: -5, max: 200 }),
    }),
  },
  { requiredKeys: [] },
);

describe("propiedades", () => {
  it("decode(RawImage, opciones arbitrarias) resuelve o rechaza con ScanError", async () => {
    await fc.assert(
      fc.asyncProperty(rawImage, options, async (img, o) => {
        try {
          const r = await decode(img, o as never);
          expect(Array.isArray(r)).toBe(true);
        } catch (e) {
          if (!isScanError(e)) throw e;
        }
      }),
      { numRuns: Math.min(RUNS, 300) },
    );
  }, 120_000);

  it("decode(bytes arbitrarios) nunca lanza otra cosa que ScanError", async () => {
    const pngHead = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 512 }), fc.boolean(), async (bytes, png) => {
        const input = png ? new Uint8Array([...pngHead, ...bytes]) : bytes;
        await decode(input).catch((e) => {
          if (!isScanError(e)) throw e;
        });
      }),
      { numRuns: RUNS },
    );
  }, 120_000);

  it("readQuad con cuadriláteros arbitrarios (incluidos NaN y degenerados) no rompe el motor", () => {
    const r = {
      kind: "luma" as const,
      data: new Uint8Array(64 * 64).fill(128),
      width: 64,
      height: 64,
      stride: 64,
    };
    const coord = fc.oneof(
      fc.double({ min: -1e4, max: 1e4 }),
      fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, 0),
    );
    fc.assert(
      fc.property(
        fc.array(fc.record({ x: coord, y: coord }), { minLength: 4, maxLength: 4 }),
        fc.integer({ min: 1, max: 300 }),
        fc.integer({ min: 1, max: 300 }),
        (q, w, h) => {
          try {
            engine.readQuad(r, q, w, h, encodeOptions({ timeBudgetMs: 20 }));
          } catch (e) {
            expect(String(e)).toMatch(/invalid quad/);
          }
        },
      ),
      { numRuns: Math.min(RUNS, 300) },
    );
  }, 120_000);

  it("los parsers nunca lanzan", () => {
    const text = fc.oneof(
      fc.string({ unit: "binary", maxLength: 300 }),
      fc.string({ maxLength: 120 }).map((s) => `(01)${s}(17)${s}`),
      fc.string({ maxLength: 120 }).map((s) => `WIFI:${s};;`),
      fc.string({ maxLength: 120 }).map((s) => `BEGIN:VCARD\n${s}\nEND:VCARD`),
      fc.string({ maxLength: 200 }).map((s) => `@\n\x1e\rANSI 6360140801DL00410278${s}`),
      fc.string({ maxLength: 120 }).map((s) => `[)>\x1e06\x1d${s}\x1e\x04`),
    );
    fc.assert(
      fc.property(text, (t) => {
        parseGS1(t);
        parseQRContent(t);
        parseAAMVA(t);
        parseISO15434(t);
      }),
      { numRuns: RUNS * 3 },
    );
  });

  it("mapPoints devuelve puntos finitos para cajas válidas", () => {
    const pos = fc.double({ min: 0, max: 1, noNaN: true });
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            x: fc.double({ min: -5000, max: 5000, noNaN: true }),
            y: fc.double({ min: -5000, max: 5000, noNaN: true }),
          }),
          { maxLength: 8 },
        ),
        fc.record({
          width: fc.integer({ min: 1, max: 8000 }),
          height: fc.integer({ min: 1, max: 8000 }),
        }),
        fc.record({
          width: fc.integer({ min: 0, max: 4000 }),
          height: fc.integer({ min: 0, max: 4000 }),
        }),
        fc.constantFrom("cover", "contain", "fill", "none", "scale-down"),
        pos,
        pos,
        fc.boolean(),
        (pts, src, box, fit, px, py, mir) => {
          for (const p of mapPoints(pts, src, box, fit as never, { x: px, y: py }, mir)) {
            expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
          }
        },
      ),
      { numRuns: RUNS },
    );
  });
});
