// Implementación del plugin (corre dentro del worker de @qhago/ai).
import type {
  PluginOptions,
  PluginProposal,
  PluginRaster,
  ScannerPlugin,
} from "@qhago/scanner/worker-host";
import type { InferenceSession, Tensor } from "onnxruntime-web";
import { CLASS_FORMATS, INPUT } from "./model";
import { MODEL_VERSION } from "./options";
import { decodePeaks } from "./postprocess";
import { fromHalf, letterbox, toHalf } from "./preprocess";

type Ort = typeof import("onnxruntime-web");

const CACHE = `qhago-ai-${MODEL_VERSION}`;
/** Fracción máxima del tiempo de vídeo que puede ocupar la inferencia. */
const AI_DUTY = 0.25;

async function fetchModel(url: string, useCache: boolean): Promise<Uint8Array> {
  const cache =
    useCache && typeof caches !== "undefined" ? await caches.open(CACHE).catch(() => null) : null;
  const hit = await cache?.match(url);
  const res = hit ?? (await fetch(url));
  if (!res.ok) throw new Error(`No se pudo descargar el modelo (${res.status}) desde ${url}`);
  if (!hit && cache) await cache.put(url, res.clone()).catch(() => {});
  return new Uint8Array(await res.arrayBuffer());
}

function hasWebGpu(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

/** Fábrica registrada en startWorkerHost({ plugins: { "ai-detector": createAiDetector } }). */
export async function createAiDetector(options: PluginOptions): Promise<ScannerPlugin> {
  const backend = (options.backend as string) ?? "wasm";
  const webgpu = backend === "webgpu" || (backend === "auto" && hasWebGpu());
  // Import dinámico: el bundle WebGPU incluye también WASM; el de WASM es más ligero.
  const ort: Ort = webgpu
    ? await import("onnxruntime-web/webgpu")
    : await import("onnxruntime-web/wasm");
  if (typeof options.wasmPaths === "string") ort.env.wasm.wasmPaths = options.wasmPaths;
  const fp16 = webgpu;
  const url = String(
    options.modelUrl ??
      (fp16
        ? new URL("../models/detector.fp16.onnx", import.meta.url)
        : new URL("../models/detector.int8.onnx", import.meta.url)),
  );
  const model = await fetchModel(url, options.cache !== false);
  let session: InferenceSession;
  try {
    session = await ort.InferenceSession.create(model, {
      executionProviders: webgpu ? ["webgpu", "wasm"] : ["wasm"],
      graphOptimizationLevel: "all",
    });
  } catch (e) {
    if (!webgpu || backend === "webgpu") throw e;
    // WebGPU anunciado pero no usable (adaptador nulo, drivers): WASM con el modelo INT8.
    return createAiDetector({ ...options, backend: "wasm", modelUrl: options.modelUrl ?? null });
  }
  const minConfidence = Number(options.minConfidence ?? 0.4);
  const maxObjects = Number(options.maxObjects ?? 5);
  const buf = new Float32Array(INPUT * INPUT);
  const half = fp16 ? new Uint16Array(INPUT * INPUT) : null;
  const read = (t: Tensor): ArrayLike<number> =>
    t.type === "float16" && t.data instanceof Uint16Array
      ? Array.from(t.data, fromHalf)
      : (t.data as Float32Array);
  const intervalMs = Number(options.intervalMs ?? 300);
  let busy = false;
  let next = Number.NEGATIVE_INFINITY;

  return {
    name: "ai-detector",
    when: options.when === "always" ? "always" : "fallback",
    async onFrame(raster: PluginRaster, ctx): Promise<PluginProposal[]> {
      // En vídeo, como mucho una inferencia cada intervalMs y nunca más del 25 % del tiempo: en un Android
      // de gama media una inferencia WASM tarda ~1 s y bloquea el worker (medido: frames de 1-3 s).
      // En decode() de una imagen, siempre.
      const now = performance.now();
      if (busy || (ctx.source === "video" && now < next)) return [];
      busy = true;
      try {
        const [x, lb] = letterbox(raster, buf);
        const input = half
          ? new ort.Tensor("float16", toHalf(x, half), [1, 1, INPUT, INPUT])
          : new ort.Tensor("float32", x, [1, 1, INPUT, INPUT]);
        const out = await session.run({ input });
        const dets = decodePeaks(
          read(out.heat as Tensor),
          read(out.offset as Tensor),
          read(out.corners as Tensor),
          lb,
          minConfidence,
          maxObjects,
        );
        return dets.map((d) => ({
          quad: d.corners,
          formats: CLASS_FORMATS[d.cls],
          score: d.score,
        }));
      } finally {
        busy = false;
        const cost = performance.now() - now;
        next = performance.now() + Math.max(intervalMs - cost, cost * (1 / AI_DUTY - 1));
      }
    },
    dispose() {
      void session.release();
    },
  };
}
