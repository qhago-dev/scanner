import type { BarcodeFormat } from "@qhago/scanner";
import type { Rgba } from "../image";

export interface Detected {
  format: BarcodeFormat;
  text: string;
}

export interface FrameInput {
  rgba: Rgba;
  /** Ruta del archivo (Quagga2 en Node solo acepta rutas). */
  path?: string;
}

export interface Engine {
  name: string;
  version: string;
  /** Formatos que este motor es capaz de leer (los demás no cuentan en su recall por formato). */
  supports: readonly BarcodeFormat[];
  /** Notas de configuración/justicia que aparecen en el reporte. */
  notes: string;
  init(): Promise<void>;
  decode(input: FrameInput): Promise<Detected[]>;
  dispose(): Promise<void>;
}

/** Normaliza nombres de formato de cada librería a los nuestros. */
const NORM: Record<string, BarcodeFormat> = {
  aztec: "aztec",
  azteccode: "aztec",
  aztecrune: "aztec",
  codabar: "codabar",
  code39: "code_39",
  code39std: "code_39",
  code39ext: "code_39",
  code93: "code_93",
  code128: "code_128",
  datamatrix: "data_matrix",
  ean8: "ean_8",
  ean13: "ean_13",
  isbn: "ean_13",
  itf: "itf",
  itf14: "itf",
  i2of5: "itf",
  pdf417: "pdf417",
  compactpdf417: "pdf417",
  qrcode: "qr_code",
  qrcodemodel1: "qr_code",
  qrcodemodel2: "qr_code",
  upca: "upc_a",
  upce: "upc_e",
};

export function normFormat(name: string): BarcodeFormat | null {
  return NORM[name.toLowerCase().replace(/[^a-z0-9]/g, "")] ?? null;
}
