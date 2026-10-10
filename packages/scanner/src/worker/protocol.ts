import type { ScanErrorCode } from "../errors";
import type { ImageInput } from "../input/common";
import type { FrameMeta, WireEvent } from "../scanner/session";
import type { ScannerWorkerOptions } from "../scanner/types";
import type { BarcodeResult, DecodeOptions, DecodeWithErrors } from "../types";

/** Opciones serializables (sin AbortSignal). */
export type WireOptions = Omit<DecodeOptions, "signal"> & { includeErrors?: boolean };

export type ToWorker =
  | { t: "init"; wasmModule: WebAssembly.Module }
  | { t: "decode"; id: number; input: ImageInput; options: WireOptions }
  | { t: "open"; sid: number; options: ScannerWorkerOptions }
  | { t: "config"; sid: number; options: Partial<ScannerWorkerOptions> }
  | {
      t: "stream";
      sid: number;
      readable: ReadableStream<VideoFrame>;
      srcWidth: number;
      srcHeight: number;
      maxFps: number;
    }
  | { t: "frame"; sid: number; id: number; frame: ImageBitmap | VideoFrame; meta: FrameMeta }
  | { t: "source"; sid: number; srcWidth: number; srcHeight: number }
  | { t: "pause"; sid: number }
  | { t: "resume"; sid: number }
  | { t: "close"; sid: number };

export type FromWorker =
  | { t: "ready" }
  | { t: "result"; id: number; value: BarcodeResult[] | DecodeWithErrors }
  | { t: "error"; id: number; code: ScanErrorCode; message: string }
  | { t: "done"; sid: number; id: number; ms: number; passes: string[] }
  | { t: "event"; sid: number; event: WireEvent };
