// Exportaciones idénticas en todas las plataformas.
export { configure } from "./config";
export { isScanError, ScanError, type ScanErrorCode } from "./errors";
export { DEFAULT_FORMATS, FORMATS, isBarcodeFormat } from "./formats";
export type { ImageInput } from "./input/common";
export type {
  AdvancedDecodeOptions,
  BarcodeFormat,
  BarcodeResult,
  ContentType,
  DecodeCandidate,
  DecodeEngine,
  DecodeOptions,
  DecodeStrategy,
  DecodeWithErrors,
  EngineConfig,
  Point,
  RawImage,
  Rect,
} from "./types";
