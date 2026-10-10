import { getConfig } from "./config";
import { ABI_VERSION } from "./engine/module";

declare const __QHAGO_VERSION__: string;

export interface EnvironmentReport {
  version: string;
  abi: number;
  runtime: "browser" | "worker" | "node" | "bun" | "deno" | "unknown";
  userAgent?: string;
  secureContext?: boolean;
  crossOriginIsolated?: boolean;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  features: Record<string, boolean>;
  /** Formatos que soporta el BarcodeDetector nativo (vacío si no existe). */
  nativeFormats: string[];
  camera?: { permission: string; devices: number };
  config: { wasmUrl?: string; workerUrl?: string; workerFactory: boolean };
}

// wasm-feature-detect: módulo mínimo con una instrucción SIMD (i8x16.splat + i8x16.popcnt).
const SIMD = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15,
  253, 98, 11,
]);

function moduleWorkers(): boolean {
  if (typeof Worker !== "function") return false;
  let ok = false;
  try {
    // El getter solo se lee si el navegador entiende la opción `type`.
    new Worker("data:,", {
      get type() {
        ok = true;
        return "module" as const;
      },
    }).terminate();
  } catch {
    // ignorado
  }
  return ok;
}

/** Cada sonda asíncrona tiene 2 s: un informe de diagnóstico nunca debe colgarse (p. ej. permisos en Firefox). */
function probe<T>(p: Promise<T> | undefined, fallback: T, ms = 2000): Promise<T> {
  if (!p) return Promise.resolve(fallback);
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>((r) => setTimeout(() => r(fallback), ms)),
  ]);
}

function runtime(): EnvironmentReport["runtime"] {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.Bun !== "undefined") return "bun";
  if (typeof g.Deno !== "undefined") return "deno";
  if (typeof (g.process as { versions?: { node?: string } })?.versions?.node === "string")
    return "node";
  if (typeof g.window !== "undefined") return "browser";
  if (typeof g.importScripts === "function") return "worker";
  return "unknown";
}

/** Informe del entorno para adjuntar a issues (sin datos personales: no incluye ids de cámara ni etiquetas). */
export async function getEnvironmentReport(): Promise<EnvironmentReport> {
  const g = globalThis as Record<string, unknown>;
  const nav = (typeof navigator !== "undefined" ? navigator : undefined) as
    | (Navigator & { deviceMemory?: number })
    | undefined;
  const has = (k: string) => typeof g[k] !== "undefined";
  const features: Record<string, boolean> = {
    webAssembly: has("WebAssembly"),
    wasmExceptions: typeof WebAssembly !== "undefined" && "Exception" in WebAssembly,
    wasmSimd: typeof WebAssembly !== "undefined" && WebAssembly.validate(SIMD),
    worker: has("Worker"),
    moduleWorker: moduleWorkers(),
    offscreenCanvas: has("OffscreenCanvas"),
    createImageBitmap: has("createImageBitmap"),
    videoFrame: has("VideoFrame"),
    mediaStreamTrackProcessor: has("MediaStreamTrackProcessor"),
    requestVideoFrameCallback:
      typeof HTMLVideoElement !== "undefined" &&
      "requestVideoFrameCallback" in HTMLVideoElement.prototype,
    barcodeDetector: has("BarcodeDetector"),
    getUserMedia: !!nav?.mediaDevices?.getUserMedia,
  };
  let nativeFormats: string[] = [];
  const BD = g.BarcodeDetector as
    | { getSupportedFormats?: () => Promise<string[]>; __qhagoPolyfill?: boolean }
    | undefined;
  if (BD?.getSupportedFormats && !BD.__qhagoPolyfill)
    nativeFormats = await probe(BD.getSupportedFormats(), []);
  let camera: EnvironmentReport["camera"];
  if (nav?.mediaDevices?.enumerateDevices) {
    const permission = await probe(
      nav.permissions?.query({ name: "camera" as PermissionName }).then((p) => p.state as string),
      "unknown",
    );
    const devices = (await probe(nav.mediaDevices.enumerateDevices(), [])).filter(
      (d) => d.kind === "videoinput",
    ).length;
    camera = { permission: permission ?? "unknown", devices };
  }
  const cfg = getConfig();
  return {
    version: typeof __QHAGO_VERSION__ === "string" ? __QHAGO_VERSION__ : "dev",
    abi: ABI_VERSION,
    runtime: runtime(),
    userAgent: nav?.userAgent,
    secureContext: g.isSecureContext as boolean | undefined,
    crossOriginIsolated: g.crossOriginIsolated as boolean | undefined,
    hardwareConcurrency: nav?.hardwareConcurrency,
    deviceMemory: nav?.deviceMemory,
    features,
    nativeFormats,
    camera,
    config: {
      wasmUrl: cfg.wasmUrl ? String(cfg.wasmUrl) : undefined,
      workerUrl: cfg.workerUrl ? String(cfg.workerUrl) : undefined,
      workerFactory: !!cfg.workerFactory,
    },
  };
}
