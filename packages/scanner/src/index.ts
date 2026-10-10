// Entrada de navegador (main thread y workers).
import { configure } from "./config";
import { checkOptions, type DecodeAllOptions, decodeInline } from "./core";
import { loadEngine } from "./engine/load-browser";
import { throwIfAborted } from "./errors";
import { DEFAULT_FORMATS } from "./formats";
import type { ImageInput } from "./input/common";
import { decodeNative, nativeSupports } from "./native";
import { browserPlatform } from "./platform-browser";
import type { BarcodeResult, DecodeOptions, DecodeWithErrors, EngineConfig } from "./types";
import { canUseWorker, decodeInWorker, warmWorker } from "./worker/client";

export * from "./api-common";
export {
  type CameraCapabilities,
  type CameraInfo,
  getPermissionState,
  listCameras,
} from "./scanner/camera";
export { createScanner, Scanner, type ScannerOptions, type ScannerRoute } from "./scanner/scanner";
export type { FusionOptions, ScannerEvent, ScannerState, TrackedResult } from "./scanner/types";

/** Precarga el motor (y el worker interno en el main thread). Opcional: decode() lo hace solo. */
export async function init(config?: EngineConfig & { signal?: AbortSignal }): Promise<void> {
  if (config) {
    const { signal: _s, ...rest } = config;
    configure(rest);
  }
  throwIfAborted(config?.signal);
  await (canUseWorker() ? warmWorker() : loadEngine());
}

/** Lee todos los códigos de una imagen. */
export function decode(
  input: ImageInput,
  options?: DecodeOptions & { includeErrors?: false },
): Promise<BarcodeResult[]>;
export function decode(
  input: ImageInput,
  options: DecodeOptions & { includeErrors: true },
): Promise<DecodeWithErrors>;
export async function decode(
  input: ImageInput,
  options: DecodeAllOptions = {},
): Promise<BarcodeResult[] | DecodeWithErrors> {
  checkOptions(options);
  throwIfAborted(options.signal);
  const engine = options.engine ?? "wasm";
  if (engine !== "wasm" && !options.includeErrors) {
    const useNative =
      engine === "native" || (await nativeSupports(options.formats ?? DEFAULT_FORMATS));
    if (useNative) return decodeNative(input, options);
  }
  if (options.worker !== false && canUseWorker()) {
    const { signal, workerFactory, ...wire } = options;
    return decodeInWorker(input, wire, signal, workerFactory);
  }
  return decodeInline(browserPlatform, input, options);
}
