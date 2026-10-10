import type { BarcodeFormat, BarcodeResult } from "./types";

/**
 * Un símbolo UPC-A es físicamente un EAN-13 con 0 inicial. ZXing v3 lo devuelve en forma GTIN-13
 * (13 dígitos) y como EAN-13 si se piden ambos formatos. Para coincidir con BarcodeDetector y Quagga2:
 * si se pidió upc_a, un EAN-13 con 0 inicial (o un UPC-A de 13 dígitos) se reporta como upc_a de 12 dígitos.
 */
export function normalizeUpc(r: BarcodeResult, requested: readonly BarcodeFormat[]): BarcodeResult {
  const wantsUpc = requested.includes("upc_a");
  const thirteen = r.text.length === 13 && r.text.startsWith("0");
  if (!wantsUpc || !thirteen || (r.format !== "ean_13" && r.format !== "upc_a")) return r;
  const text = r.text.slice(1);
  return { ...r, format: "upc_a", text, bytes: new TextEncoder().encode(text) };
}
