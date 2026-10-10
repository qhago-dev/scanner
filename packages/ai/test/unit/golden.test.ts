// Preproceso + modelo + postproceso en TS (onnxruntime-web en Node, backend WASM) frente al golden de Python.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ort from "onnxruntime-web";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import { aiDetector } from "../../src/index";
import { INPUT } from "../../src/model";
import { decodePeaks, type Point } from "../../src/postprocess";
import { fromHalf, letterbox, toHalf } from "../../src/preprocess";

const FIX = join(import.meta.dirname, "../fixtures");
const MODEL = join(import.meta.dirname, "../../models/detector.int8.onnx");

interface Golden {
  file: string;
  width: number;
  height: number;
  detections: { cls: number; score: number; corners: number[][] }[];
}
const golden = JSON.parse(readFileSync(join(FIX, "golden.json"), "utf8")) as Golden[];

function luma(file: string) {
  const png = PNG.sync.read(readFileSync(join(FIX, file)));
  const data = new Uint8Array(png.width * png.height);
  for (let i = 0; i < data.length; i++) data[i] = png.data[i * 4] as number;
  return { kind: "luma" as const, data, width: png.width, height: png.height, stride: png.width };
}

let session: ort.InferenceSession;
beforeAll(async () => {
  ort.env.wasm.numThreads = 1;
  session = await ort.InferenceSession.create(new Uint8Array(readFileSync(MODEL)), {
    executionProviders: ["wasm"],
  });
});

describe("golden (TS ≡ Python)", () => {
  it.each(golden.map((g) => [g.file, g] as const))("%s", async (_f, g) => {
    const src = luma(g.file);
    const [x, lb] = letterbox(src);
    const out = await session.run({ input: new ort.Tensor("float32", x, [1, 1, INPUT, INPUT]) });
    const dets = decodePeaks(
      out.heat?.data as Float32Array,
      out.offset?.data as Float32Array,
      out.corners?.data as Float32Array,
      lb,
      0.4,
      5,
    );
    // Cada detección de referencia tiene su pareja (misma clase) con esquinas cercanas.
    for (const want of g.detections) {
      const side = Math.hypot(
        (want.corners[1]?.[0] ?? 0) - (want.corners[0]?.[0] ?? 0),
        (want.corners[1]?.[1] ?? 0) - (want.corners[0]?.[1] ?? 0),
      );
      const err = (c: Point[]) =>
        Math.max(
          ...c.map((p, i) =>
            Math.hypot(p.x - (want.corners[i]?.[0] ?? 0), p.y - (want.corners[i]?.[1] ?? 0)),
          ),
        );
      const best = Math.min(...dets.filter((d) => d.cls === want.cls).map((d) => err(d.corners)));
      expect(best, `cls ${want.cls}`).toBeLessThan(Math.max(4, side * 0.06));
    }
    expect(dets.length).toBeGreaterThanOrEqual(g.detections.length - 1);
  });
});

describe("piezas puras", () => {
  it("letterbox: relleno 114/255 y escala", () => {
    const src = {
      kind: "luma" as const,
      data: new Uint8Array(640 * 320).fill(255),
      width: 640,
      height: 320,
      stride: 640,
    };
    const [x, lb] = letterbox(src);
    expect(lb).toEqual({ scale: 0.5, padX: 0, padY: 80 });
    expect(x[0]).toBeCloseTo(114 / 255);
    expect(x[160 * INPUT + 160]).toBe(1);
  });

  it("letterbox RGBA usa la misma luma que el motor", () => {
    const rgba = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < 16; i++) rgba.set([200, 100, 50, 255], i * 4);
    const [x] = letterbox({ kind: "rgba", data: rgba, width: 4, height: 4, stride: 16 });
    expect(x[0]).toBeCloseTo(((77 * 200 + 150 * 100 + 29 * 50) >> 8) / 255);
  });

  it("float16 ida y vuelta", () => {
    const v = new Float32Array([0, 1, -2.5, 0.1234, 65504, 1e-5]);
    const back = Array.from(toHalf(v), fromHalf);
    for (const [i, b] of back.entries()) expect(b).toBeCloseTo(v[i] as number, i === 5 ? 6 : 2);
  });

  it("aiDetector valida opciones y es serializable", () => {
    const d = aiDetector({ when: "always", modelUrl: new URL("https://cdn.example/m.onnx") });
    expect(structuredClone(d)).toEqual(d);
    expect(d).toMatchObject({
      name: "ai-detector",
      apiVersion: 1,
      options: { when: "always", modelUrl: "https://cdn.example/m.onnx" },
    });
    expect(() => aiDetector({ minConfidence: 2 })).toThrow(RangeError);
    expect(() => aiDetector({ maxObjects: 0 })).toThrow(RangeError);
  });
});
