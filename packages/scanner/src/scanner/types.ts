import type {
  BarcodeFormat,
  BarcodeResult,
  DecodeStrategy,
  Rect,
  ScannerPluginDescriptor,
} from "../types";

/** Resultado con identidad de seguimiento entre frames. Coordenadas en píxeles del vídeo original. */
export interface TrackedResult extends BarcodeResult {
  trackId: number;
  /** Frames que confirmaron esta lectura dentro de la ventana de fusión. */
  votes: number;
  firstSeen: number;
  lastSeen: number;
}

export type ScannerEvent =
  | { type: "detect"; result: TrackedResult }
  | { type: "candidate"; result: TrackedResult }
  /** Posición actualizada de un código ya confirmado (para overlays); no implica nueva lectura. */
  | { type: "track"; result: TrackedResult }
  | { type: "lost"; trackId: number }
  | { type: "frame"; fps: number; ms: number; passes: string[] }
  | { type: "state"; state: ScannerState }
  | { type: "error"; error: import("../errors").ScanError };

export type ScannerState =
  | "idle"
  | "starting"
  | "scanning"
  | "paused"
  | "stopped"
  | "destroyed"
  | "error";

export interface FusionOptions {
  /** "auto" = regla de ADR-05 (2 para Code39, Code93, Codabar, ITF y Code128 < 6 caracteres; 1 el resto). */
  confirmFrames: number | "auto";
  /** Ventana de votación en ms. */
  windowMs: number;
  /** No re-emitir el mismo (formato, bytes) antes de este tiempo; Infinity = una vez por sesión. */
  duplicateCooldownMs: number;
}

export interface ScannerWorkerOptions {
  formats?: readonly BarcodeFormat[];
  strategy: DecodeStrategy;
  /** ROI normalizada 0..1 respecto del frame de vídeo. */
  roi: Rect | "full";
  fusion: FusionOptions;
  escalateAfterFrames: number;
  maxCodes: number;
  lostAfterMs: number;
  validateChecksums: boolean | "strict";
  plugins?: readonly ScannerPluginDescriptor[];
}
