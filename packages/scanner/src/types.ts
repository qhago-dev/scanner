import type { BarcodeFormat } from "./formats";

export type { BarcodeFormat } from "./formats";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ContentType = "text" | "binary" | "mixed" | "gs1" | "iso15434" | "unknown";

/** Resultado de una lectura válida. Coordenadas en píxeles de la imagen de entrada. */
export interface BarcodeResult {
  format: BarcodeFormat;
  text: string;
  bytes: Uint8Array;
  /** Esquinas en orden: superior-izquierda, superior-derecha, inferior-derecha, inferior-izquierda. */
  cornerPoints: [Point, Point, Point, Point];
  boundingBox: Rect;
  /** Grados (0, 90, 180, 270 o intermedios). */
  orientation: number;
  isMirrored: boolean;
  isInverted: boolean;
  contentType: ContentType;
  /** Identificador ISO/IEC 15424 (]E0, ]Q1, ]C1…). */
  symbologyIdentifier: string;
  /** Nivel de corrección de errores (2D), vacío si no aplica. */
  ecLevel: string;
  /** Heurística 0..1 (ver docs); no se usa para filtrar por defecto. */
  confidence: number;
}

/** Símbolo detectado pero no decodificado (solo con `includeErrors: true`). */
export interface DecodeCandidate {
  format: BarcodeFormat;
  cornerPoints: [Point, Point, Point, Point];
  boundingBox: Rect;
  error: "checksum" | "format" | "unsupported";
}

export type DecodeStrategy = "fast" | "balanced" | "thorough";
export type DecodeEngine = "wasm" | "native" | "auto";

export interface AdvancedDecodeOptions {
  tryHarder: boolean;
  tryRotate: boolean;
  tryInvert: boolean;
  tryDownscale: boolean;
  binarizer: "local-average" | "global-histogram" | "fixed-threshold" | "bool-cast";
  isPure: boolean;
  eanAddOn: "ignore" | "read" | "require";
  minLineCount: number;
  preprocess: { clahe?: boolean; unsharp?: boolean; multiscale?: boolean; crops?: boolean };
  /**
   * Cómo se construye `text`. "plain" (default) = contenido tal cual, igual que `rawValue` de BarcodeDetector
   * (GS1 con separador \x1d). "hri" = forma legible (GS1 con paréntesis). "escaped" = controles como <GS>.
   */
  textMode: "plain" | "hri" | "escaped" | "eci";
}

export interface DecodeOptions {
  /** Default: `DEFAULT_FORMATS` (ADR-05). */
  formats?: readonly BarcodeFormat[];
  /** Default: "balanced". */
  strategy?: DecodeStrategy;
  /** Máximo de códigos a devolver. Default 255. */
  maxSymbols?: number;
  /** Presupuesto de tiempo del motor en ms (0 = sin límite). */
  timeBudgetMs?: number;
  /**
   * true (default): checksums obligatorios + filtros de longitud;
   * "strict": además los opcionales (Code39 mod43, ITF); false: sin filtros extra.
   */
  validateChecksums?: boolean | "strict";
  /** Región a leer, en píxeles de la imagen de entrada. */
  region?: Rect;
  /** Límite duro de píxeles de entrada. Default 16e6 (límite de canvas de iOS Safari ≈ 16,7 MP). */
  maxInputPixels?: number;
  /** En el main thread de un navegador, delega en un worker interno. Default true. */
  worker?: boolean;
  /** "wasm" (default) | "native" (BarcodeDetector) | "auto". En Node/Bun siempre wasm. */
  engine?: DecodeEngine;
  signal?: AbortSignal;
  advanced?: Partial<AdvancedDecodeOptions>;
  /** Worker propio para esta llamada (p. ej. `aiWorker` de @qhago/ai). Default: `configure({ workerFactory })`. */
  workerFactory?: () => Worker;
  /**
   * Plugins que el worker aplica cuando la cascada no lee nada (p. ej. `aiDetector()` de @qhago/ai).
   * Requieren un worker que los registre (`workerFactory`); sin él, `decode()` y `start()` lanzan `ScanError("UNSUPPORTED")`.
   */
  plugins?: readonly ScannerPluginDescriptor[];
}

/**
 * Descriptor serializable de un plugin: viaja al worker, que lo resuelve por `name` en su registro
 * (`startWorkerHost({ plugins })`). Interfaz estable desde 1.0; no hay plugins oficiales hasta @qhago/ai.
 */
export interface ScannerPluginDescriptor {
  name: string;
  /** Versión de la interfaz de plugins que espera el descriptor. */
  apiVersion: 1;
  options?: Record<string, string | number | boolean | null>;
}

export interface DecodeWithErrors {
  results: BarcodeResult[];
  candidates: DecodeCandidate[];
}

/** Imagen ya rasterizada. `format: "luma"` = 1 byte/px; "rgba" = 4 bytes/px. */
export interface RawImage {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  format: "luma" | "rgba";
}

export interface EngineConfig {
  /** URL del .wasm (self-hosting / CDN). */
  wasmUrl?: string | URL;
  /** Módulo ya compilado (p. ej. recibido de otro worker). */
  wasmModule?: WebAssembly.Module;
  /** URL del worker interno de decode (self-hosting / CDN). */
  workerUrl?: string | URL;
  /** Fábrica de workers (p. ej. `aiWorker` de @qhago/ai). */
  workerFactory?: () => Worker;
}
