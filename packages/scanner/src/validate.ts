import type { BarcodeResult, DecodeOptions } from "./types";

/**
 * Filtros post-lectura (ADR-05). Con `validateChecksums: true` (default) se descartan lecturas
 * típicamente falsas en simbologías sin checksum obligatorio. `"strict"` además activa en el
 * motor los checksums opcionales (Code39 mod43, ITF). `false` no filtra nada extra.
 */
export function passesValidation(
  r: BarcodeResult,
  mode: DecodeOptions["validateChecksums"] = true,
): boolean {
  if (mode === false) return true;
  switch (r.format) {
    case "itf":
      return r.text.length >= 6 && r.text.length % 2 === 0;
    case "codabar":
      return r.text.length >= 3;
    default:
      return true;
  }
}
