// @qhago/ai — detector de códigos opcional para @qhago/scanner (F5).
//
//   import { createScanner } from "@qhago/scanner";
//   import { aiDetector, aiWorker } from "@qhago/ai";
//   createScanner({ workerFactory: aiWorker, plugins: [aiDetector()] });
import type { ScannerPluginDescriptor } from "@qhago/scanner";
import { AI_DETECTOR, type AiDetectorOptions } from "./options";

export { AI_DETECTOR, type AiDetectorOptions, MODEL_VERSION } from "./options";

/** Worker que incluye el host de @qhago/scanner y el detector (ONNX Runtime Web). */
export function aiWorker(): Worker {
  return new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
}

/** Descriptor serializable del detector; la implementación vive en `aiWorker()`. */
export function aiDetector(options: AiDetectorOptions = {}): ScannerPluginDescriptor {
  const { when = "fallback", minConfidence = 0.4, maxObjects = 5, backend = "wasm" } = options;
  if (!(minConfidence > 0 && minConfidence < 1))
    throw new RangeError("minConfidence debe estar en (0, 1)");
  if (!(Number.isInteger(maxObjects) && maxObjects > 0))
    throw new RangeError("maxObjects debe ser un entero > 0");
  const intervalMs = options.intervalMs ?? 300;
  if (!(intervalMs >= 0)) throw new RangeError("intervalMs debe ser ≥ 0");
  return {
    name: AI_DETECTOR,
    apiVersion: 1,
    options: {
      when,
      minConfidence,
      maxObjects,
      backend,
      intervalMs,
      modelUrl: options.modelUrl === undefined ? null : String(options.modelUrl),
      wasmPaths: options.wasmPaths ?? null,
      cache: options.cache ?? true,
    },
  };
}
