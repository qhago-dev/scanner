// Entrada de Node ≥ 22.12 y Bun ≥ 1.2.
import { configure } from "./config";
import { type DecodeAllOptions, decodeInline, type Platform } from "./core";
import { loadEngine } from "./engine/load-node";
import { throwIfAborted } from "./errors";
import type { ImageInput } from "./input/common";
import { toRaster } from "./input/node";
import type { BarcodeResult, DecodeOptions, DecodeWithErrors, EngineConfig } from "./types";

export * from "./api-common";

const nodePlatform: Platform = { loadEngine, toRaster };

export async function init(config?: EngineConfig & { signal?: AbortSignal }): Promise<void> {
  if (config) {
    const { signal: _s, ...rest } = config;
    configure(rest);
  }
  throwIfAborted(config?.signal);
  await loadEngine();
}

export function decode(
  input: ImageInput,
  options?: DecodeOptions & { includeErrors?: false },
): Promise<BarcodeResult[]>;
export function decode(
  input: ImageInput,
  options: DecodeOptions & { includeErrors: true },
): Promise<DecodeWithErrors>;
export function decode(
  input: ImageInput,
  options: DecodeAllOptions = {},
): Promise<BarcodeResult[] | DecodeWithErrors> {
  // En Node/Bun el motor siempre es wasm y se ejecuta en el hilo actual.
  return decodeInline(nodePlatform, input, { ...options, engine: "wasm", worker: false });
}
