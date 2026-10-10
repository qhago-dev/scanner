import type { BarcodeFormat } from "../types";
import type { FusionOptions } from "./types";

const WEAK = new Set<BarcodeFormat>(["code_39", "code_93", "codabar", "itf"]);

/** Regla de ADR-05: frames necesarios para confirmar una lectura. */
export function framesNeeded(
  format: BarcodeFormat,
  text: string,
  opt: FusionOptions["confirmFrames"],
): number {
  if (opt !== "auto") return Math.max(1, opt);
  if (WEAK.has(format)) return 2;
  if (format === "code_128" && text.length < 6) return 2;
  return 1;
}

/** Clave de contenido: formato + bytes como string latin1 (sin hash: payloads pequeños, sin colisiones). */
export function contentKey(format: BarcodeFormat, bytes: Uint8Array): string {
  let s = `${format}:`;
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] ?? 0);
  return s;
}

interface Vote {
  key: string;
  count: number;
  first: number;
  last: number;
}

export type FusionDecision =
  | { kind: "detect"; votes: number; firstSeen: number }
  | { kind: "candidate"; votes: number; firstSeen: number }
  | { kind: "duplicate" };

/**
 * Votación por track dentro de una ventana temporal. Una lectura distinta en el mismo track
 * reinicia el voto (evita emitir lecturas inestables). Deduplicación por clave con cooldown.
 */
export class Fusion {
  private votes = new Map<number, Vote>();
  private emitted = new Map<string, number>();

  constructor(private opt: FusionOptions) {}

  setOptions(opt: FusionOptions): void {
    this.opt = opt;
  }

  observe(
    trackId: number,
    key: string,
    format: BarcodeFormat,
    text: string,
    now: number,
  ): FusionDecision {
    let v = this.votes.get(trackId);
    if (!v || v.key !== key || now - v.last > this.opt.windowMs) {
      v = { key, count: 0, first: now, last: now };
      this.votes.set(trackId, v);
    }
    v.count++;
    v.last = now;
    if (v.count < framesNeeded(format, text, this.opt.confirmFrames))
      return { kind: "candidate", votes: v.count, firstSeen: v.first };
    const prev = this.emitted.get(key);
    if (prev !== undefined && now - prev < this.opt.duplicateCooldownMs) {
      return { kind: "duplicate" };
    }
    this.emitted.set(key, now);
    return { kind: "detect", votes: v.count, firstSeen: v.first };
  }

  forget(trackId: number): void {
    this.votes.delete(trackId);
  }

  reset(): void {
    this.votes.clear();
    this.emitted.clear();
  }
}
