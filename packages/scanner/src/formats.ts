/** Los 13 formatos de 1.0. Nombres = API BarcodeDetector. El orden coincide con `Format` en el motor C++. */
export const FORMATS = [
  "aztec",
  "codabar",
  "code_39",
  "code_93",
  "code_128",
  "data_matrix",
  "ean_8",
  "ean_13",
  "itf",
  "pdf417",
  "qr_code",
  "upc_a",
  "upc_e",
] as const;

export type BarcodeFormat = (typeof FORMATS)[number];

/**
 * Formatos por defecto (ADR-05): los de uso común y con checksum fuerte o validación fiable.
 * Codabar, ITF, Code93, PDF417 y Aztec son opt-in para reducir lecturas falsas.
 */
export const DEFAULT_FORMATS: readonly BarcodeFormat[] = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "qr_code",
  "data_matrix",
];

const LINEAR = new Set<BarcodeFormat>([
  "codabar",
  "code_39",
  "code_93",
  "code_128",
  "ean_8",
  "ean_13",
  "itf",
  "upc_a",
  "upc_e",
]);

export function isLinear(f: BarcodeFormat): boolean {
  return LINEAR.has(f);
}

export function isBarcodeFormat(v: unknown): v is BarcodeFormat {
  return typeof v === "string" && (FORMATS as readonly string[]).includes(v);
}

/** Bitmask para el motor (bit i = FORMATS[i]). */
export function formatsMask(formats: readonly BarcodeFormat[]): number {
  let m = 0;
  for (const f of formats) m |= 1 << FORMATS.indexOf(f);
  return m;
}
