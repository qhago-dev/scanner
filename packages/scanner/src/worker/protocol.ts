import type { ScanErrorCode } from "../errors";
import type { ImageInput } from "../input/common";
import type { BarcodeResult, DecodeOptions, DecodeWithErrors } from "../types";

/** Opciones serializables (sin AbortSignal). */
export type WireOptions = Omit<DecodeOptions, "signal"> & { includeErrors?: boolean };

export type ToDecodeWorker =
  | { t: "init"; wasmModule: WebAssembly.Module }
  | { t: "decode"; id: number; input: ImageInput; options: WireOptions };

export type FromDecodeWorker =
  | { t: "ready" }
  | { t: "result"; id: number; value: BarcodeResult[] | DecodeWithErrors }
  | { t: "error"; id: number; code: ScanErrorCode; message: string };
