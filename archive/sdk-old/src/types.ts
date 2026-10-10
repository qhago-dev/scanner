export enum Symbology {
  Code128 = "code128",
  Code39 = "code39",
  Code93 = "code93",
  Ean8 = "ean8",
  Ean13 = "ean13",
  UpcA = "upca",
  UpcE = "upce",
  Itf = "itf",
  Codabar = "codabar",
  QrCode = "qr_code",
  DataMatrix = "datamatrix",
  Pdf417 = "pdf417",
  Aztec = "aztec",
}

export interface Point {
  x: number;
  y: number;
}

export interface BarcodeResult {
  text: string;
  format: string;
  confidence: number;
  corners: Point[];
  timestamp: number;
}

export interface ScanConfig {
  symbologies: Symbology[];
  enableSuperResolution?: boolean;
  enableDeblur?: boolean;
  enablePerspectiveCorrection?: boolean;
  enableAutofocus?: boolean;
  enableTracking?: boolean;
  trackingSensitivity?: number;
  focusThreshold?: number;
  minConfidence?: number;
  scanIntervalMs?: number;
  maxResolutionWidth?: number;
}

export interface ModelConfig {
  detectorUrl?: string;
  superResolutionUrl?: string;
  deblurUrl?: string;
  perspectiveUrl?: string;
  autofocusUrl?: string;
}

export type ScanEvent =
  | { type: "decode"; data: BarcodeResult }
  | { type: "tracking"; data: BarcodeResult }
  | { type: "lost" }
  | { type: "focus"; focused: boolean }
  | { type: "error"; message: string }
  | { type: "ready" }
  | { type: "loading"; progress: number };

export type ScanEventListener = (event: ScanEvent) => void;

export enum ScannerState {
  Idle = "idle",
  Loading = "loading",
  Ready = "ready",
  Scanning = "scanning",
  Error = "error",
}

export interface AIScannerOptions {
  config?: Partial<ScanConfig>;
  models?: ModelConfig;
  wasmPath?: string;
  workerPath?: string;
}
