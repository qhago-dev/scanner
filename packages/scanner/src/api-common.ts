// Exportaciones idénticas en todas las plataformas.
export { configure } from "./config";
export { type EnvironmentReport, getEnvironmentReport } from "./diagnostics";
export { isScanError, ScanError, type ScanErrorCode } from "./errors";
export { DEFAULT_FORMATS, FORMATS, isBarcodeFormat } from "./formats";
export { mapPoints, mapToElement, type ObjectFit } from "./geometry";
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
  ScannerPluginDescriptor,
} from "./types";
