// Motor "qhago+ai" (F5.8): qhago balanced + el detector de @qhago/ai como plugin en modo fallback.
// En Node se usa onnxruntime-web (backend WASM) con el mismo pre/postproceso que el worker del navegador.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FORMATS } from "@qhago/scanner";
import * as ort from "onnxruntime-web";
import { CLASS_FORMATS, INPUT } from "../../packages/ai/src/model";
import { decodePeaks } from "../../packages/ai/src/postprocess";
import { letterbox } from "../../packages/ai/src/preprocess";
import { configure } from "../../packages/scanner/src/config";
import { decodeInline, type Platform } from "../../packages/scanner/src/core";
import { loadEngine } from "../../packages/scanner/src/engine/load-node";
import { toRaster } from "../../packages/scanner/src/input/node";
import { PluginRegistry, type ScannerPlugin } from "../../packages/scanner/src/plugins";
import type { BarcodeResult } from "../../packages/scanner/src/types";
import type { Detected, Engine, FrameInput } from "./types";

const platform: Platform = { loadEngine, toRaster };

export function qhagoAiEngine(
  model = resolve(
    process.env.QHAGO_AI_MODEL ??
      fileURLToPath(new URL("../../packages/ai/models/detector.int8.onnx", import.meta.url)),
  ),
  when: "fallback" | "always" = "fallback",
): Engine {
  let registry: PluginRegistry;
  const name = when === "always" ? "qhago+ai-always" : "qhago+ai";
  return {
    name,
    version: JSON.parse(
      readFileSync(new URL("../../packages/ai/package.json", import.meta.url), "utf8"),
    ).version,
    supports: FORMATS,
    notes: `qhago balanced + detector ${model.split("/").pop()} (${when}, umbral 0.4, máx. 5 regiones)`,
    async init() {
      // Se usa el código fuente de @qhago/scanner (PluginRegistry no es API pública en Node): apuntar al .wasm.
      configure({
        wasmUrl: new URL("../../packages/scanner/wasm/qhago_engine_node.wasm", import.meta.url),
      });
      ort.env.wasm.numThreads = 1;
      const session = await ort.InferenceSession.create(new Uint8Array(readFileSync(model)), {
        executionProviders: ["wasm"],
      });
      const plugin: ScannerPlugin = {
        name: "ai-detector",
        when,
        async onFrame(raster) {
          const [x, lb] = letterbox(raster);
          const out = await session.run({
            input: new ort.Tensor("float32", x, [1, 1, INPUT, INPUT]),
          });
          return decodePeaks(
            out.heat?.data as Float32Array,
            out.offset?.data as Float32Array,
            out.corners?.data as Float32Array,
            lb,
            0.4,
            5,
          ).map((d) => ({
            quad: d.corners,
            formats: CLASS_FORMATS[d.cls],
            score: d.score,
          }));
        },
      };
      registry = new PluginRegistry({ "ai-detector": () => plugin });
    },
    async decode({ rgba }: FrameInput): Promise<Detected[]> {
      const r = (await decodeInline(
        platform,
        { ...rgba, format: "rgba" },
        {
          formats: FORMATS,
          strategy: "balanced",
          plugins: [{ name: "ai-detector", apiVersion: 1 }],
        },
        registry,
      )) as BarcodeResult[];
      return r.map((x) => ({ format: x.format, text: x.text }));
    },
    async dispose() {},
  };
}
