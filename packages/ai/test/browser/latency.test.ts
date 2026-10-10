// Latencia del detector en el navegador (ORT Web, WASM, 1 hilo): preproceso + inferencia + postproceso.
// Solo mide e informa (model card); el umbral duro está en el bench de dispositivo.
import * as ort from "onnxruntime-web/wasm";
import { describe, expect, it } from "vitest";

declare global {
  interface ImportMeta {
    env?: Record<string, string | undefined>;
  }
}

import { INPUT } from "../../src/model";
import { decodePeaks } from "../../src/postprocess";
import { letterbox } from "../../src/preprocess";

describe("latencia (WASM)", () => {
  it.each([
    "detector.int8.onnx",
    ...(import.meta.env?.VITE_QHAGO_FP32 ? ["detector.fp32.tmp.onnx"] : []),
  ])(
    "p50 de 1280×720 → detecciones (%s)",
    async (name) => {
      ort.env.wasm.numThreads = 1;
      const model = new Uint8Array(
        await (await fetch(new URL(`../../models/${name}`, import.meta.url))).arrayBuffer(),
      );
      const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
      const w = 1280;
      const h = 720;
      const data = new Uint8Array(w * h).map((_, i) => (i * 2654435761) >>> 24);
      const raster = { kind: "luma" as const, data, width: w, height: h, stride: w };
      const buf = new Float32Array(INPUT * INPUT);
      const times: number[] = [];
      const pre: number[] = [];
      for (let i = 0; i < 25; i++) {
        const t0 = performance.now();
        const [x, lb] = letterbox(raster, buf);
        if (i >= 5) pre.push(performance.now() - t0);
        const out = await session.run({
          input: new ort.Tensor("float32", x, [1, 1, INPUT, INPUT]),
        });
        decodePeaks(
          out.heat?.data as Float32Array,
          out.offset?.data as Float32Array,
          out.corners?.data as Float32Array,
          lb,
        );
        if (i >= 5) times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      const p50 = times[Math.floor(times.length / 2)] as number;
      pre.sort((a, b) => a - b);
      console.log(
        `[qhago-ai] ${name} ${navigator.userAgent.match(/(Chrome|Firefox)\/[\d.]+/)?.[0]} WASM 1 hilo: p50 ${p50.toFixed(1)} ms (letterbox ${pre[10]?.toFixed(1)} ms)`,
      );
      expect(p50).toBeGreaterThan(0);
    },
    120_000,
  );
});
