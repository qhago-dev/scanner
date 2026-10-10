// Polyfill de la API BarcodeDetector (https://wicg.github.io/shape-detection-api/#barcode-detection-api).

import { FORMATS, isBarcodeFormat } from "../formats";
import { decode } from "../index";
import type { BarcodeFormat, Point } from "../types";

export interface DetectedBarcode {
  boundingBox: DOMRectReadOnly;
  cornerPoints: Point[];
  format: BarcodeFormat;
  rawValue: string;
}

const rect = (x: number, y: number, w: number, h: number): DOMRectReadOnly =>
  typeof DOMRectReadOnly === "function"
    ? new DOMRectReadOnly(x, y, w, h)
    : ({
        x,
        y,
        width: w,
        height: h,
        top: y,
        left: x,
        right: x + w,
        bottom: y + h,
        toJSON() {},
      } as DOMRectReadOnly);

export class BarcodeDetectorPolyfill {
  static readonly __qhagoPolyfill = true;
  private readonly formats: BarcodeFormat[];

  /** Formatos soportados por este polyfill (los 13 de 1.0). */
  static async getSupportedFormats(): Promise<BarcodeFormat[]> {
    return [...FORMATS];
  }

  constructor(options?: { formats?: string[] }) {
    if (options?.formats !== undefined) {
      if (options.formats.length === 0)
        throw new TypeError("BarcodeDetector: 'formats' no puede estar vacío");
      for (const f of options.formats) {
        if (f === "unknown" || !isBarcodeFormat(f))
          throw new TypeError(`BarcodeDetector: formato no soportado '${f}'`);
      }
    }
    // Sin formats, la spec busca todos los soportados (no los defaults reducidos de ADR-05).
    this.formats = (options?.formats as BarcodeFormat[] | undefined) ?? [...FORMATS];
  }

  /** Acepta todo ImageBitmapSource de la spec (img, video, canvas, ImageBitmap, ImageData, Blob, VideoFrame…). */
  async detect(image: ImageBitmapSource | Blob | VideoFrame): Promise<DetectedBarcode[]> {
    let input = image as unknown;
    const isVideo = typeof HTMLVideoElement === "function" && image instanceof HTMLVideoElement;
    const isSvg = typeof SVGImageElement === "function" && image instanceof SVGImageElement;
    if (isVideo || isSvg) input = await createImageBitmap(image as ImageBitmapSource);
    const results = await decode(input as never, { formats: this.formats, strategy: "balanced" });
    if (input !== image) (input as ImageBitmap).close();
    return results.map((r) => ({
      boundingBox: rect(
        r.boundingBox.x,
        r.boundingBox.y,
        r.boundingBox.width,
        r.boundingBox.height,
      ),
      cornerPoints: r.cornerPoints.map((p) => ({ x: p.x, y: p.y })),
      format: r.format,
      rawValue: r.text,
    }));
  }
}

/** Registra el polyfill en globalThis.BarcodeDetector si no existe (o siempre con `force`). */
export function installPolyfill(opts: { force?: boolean } = {}): void {
  const g = globalThis as { BarcodeDetector?: unknown };
  if (!g.BarcodeDetector || opts.force) g.BarcodeDetector = BarcodeDetectorPolyfill;
}
