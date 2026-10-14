// Crea el Scanner (y las opciones de decode()) según lo elegido en la UI: formatos, IA y cámara.
import {
  type BarcodeFormat,
  type BarcodeResult,
  createScanner,
  DEFAULT_FORMATS,
  decode,
  FORMATS,
  type Scanner,
} from "@qhago/scanner";

export type FormatPreset = "products" | "default" | "all";

export const PRESETS: Record<FormatPreset, readonly BarcodeFormat[]> = {
  products: ["ean_13", "ean_8", "upc_a", "upc_e"],
  default: DEFAULT_FORMATS,
  all: FORMATS,
};

/** "off": sin IA. "fallback": la IA solo actúa si el motor clásico no lee. "always": en cada frame (diagnóstico). */
export type AiMode = "off" | "fallback" | "always";

export interface ScanSettings {
  formats: readonly BarcodeFormat[];
  ai: AiMode;
  deviceId?: string;
}

type AiModule = typeof import("@qhago/ai");
let aiModule: Promise<AiModule> | null = null;

/**
 * @qhago/ai se importa con import() en la app (no en el paquete, ADR-06): así ni ONNX Runtime ni el modelo se
 * descargan hasta que se activa la IA.
 */
export function loadAi(): Promise<AiModule> {
  aiModule ??= import("@qhago/ai").catch((e) => {
    aiModule = null;
    throw e;
  });
  return aiModule;
}

async function aiOptions(mode: AiMode) {
  if (mode === "off") return {};
  const { aiWorker, aiDetector } = await loadAi();
  return { workerFactory: aiWorker, plugins: [aiDetector({ when: mode })] };
}

export async function buildScanner(video: HTMLVideoElement, s: ScanSettings): Promise<Scanner> {
  return createScanner({
    video,
    formats: s.formats,
    camera: { facingMode: "environment", ...(s.deviceId ? { deviceId: s.deviceId } : {}) },
    ...(await aiOptions(s.ai)),
  });
}

export async function decodeFile(file: Blob, s: ScanSettings): Promise<BarcodeResult[]> {
  return decode(file, { formats: s.formats, strategy: "thorough", ...(await aiOptions(s.ai)) });
}

/** Cómo corre ONNX Runtime aquí: sin COOP/COEP (GitHub Pages) no hay SharedArrayBuffer y va en un hilo. */
export function aiBackendLabel(): string {
  return globalThis.crossOriginIsolated ? "WASM multihilo" : "WASM, 1 hilo";
}
