export interface AiDetectorOptions {
  /** "fallback" (default): solo si el motor clásico no lee tras `escalateAfterFrames`; "always": cada frame. */
  when?: "fallback" | "always";
  /** Umbral del heatmap. Default 0.4. */
  minConfidence?: number;
  /** Máximo de regiones a leer por frame. Default 5. */
  maxObjects?: number;
  /**
   * "wasm" (default): ORT WASM + modelo INT8 (~3,7 MB gzip de runtime). "webgpu" / "auto" (WebGPU si existe):
   * modelo FP16 y runtime WebGPU (~6,7 MB gzip); para este modelo pequeño rara vez compensa.
   */
  backend?: "auto" | "webgpu" | "wasm";
  /** Modelo ONNX. Default: models/detector.int8.onnx (WASM) o detector.fp16.onnx (WebGPU) del paquete. */
  modelUrl?: string | URL;
  /** Carpeta de los .wasm de onnxruntime-web (self-hosting/CDN). Default: la que resuelve onnxruntime-web. */
  wasmPaths?: string;
  /**
   * Intervalo mínimo entre inferencias en vídeo, en ms. Default 300. La red cuesta ~100 ms por frame en WASM
   * (1 hilo, escritorio); sin este límite, el modo "fallback" bajaría los fps justo cuando no hay código.
   */
  intervalMs?: number;
  /** Guardar el modelo en Cache API. Default true. */
  cache?: boolean;
}

export const AI_DETECTOR = "ai-detector";
export const MODEL_VERSION = "detector-v1";
