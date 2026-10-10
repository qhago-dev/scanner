import type { Raster } from "../engine/engine";
import { ScanError } from "../errors";
import type { RawImage } from "../types";

/** Entradas aceptadas por `decode()`. En Node/Bun solo aplican RawImage, ImageData-like, bytes y Blob. */
export type ImageInput =
  | RawImage
  | ImageData
  | ImageBitmap
  | HTMLImageElement
  | HTMLCanvasElement
  | HTMLVideoElement
  | SVGImageElement
  | OffscreenCanvas
  | VideoFrame
  | Blob
  | ArrayBuffer
  | Uint8Array;

export function isRawImage(v: unknown): v is RawImage {
  return (
    typeof v === "object" &&
    v !== null &&
    "format" in v &&
    "data" in v &&
    "width" in v &&
    "height" in v &&
    ((v as RawImage).format === "luma" || (v as RawImage).format === "rgba")
  );
}

/** ImageData real o un objeto con la misma forma (útil en Node). */
export function isImageDataLike(
  v: unknown,
): v is { data: Uint8ClampedArray | Uint8Array; width: number; height: number } {
  if (typeof v !== "object" || v === null || isRawImage(v)) return false;
  const o = v as { data?: unknown; width?: unknown; height?: unknown };
  return (
    (o.data instanceof Uint8ClampedArray || o.data instanceof Uint8Array) &&
    typeof o.width === "number" &&
    typeof o.height === "number" &&
    o.data.length >= o.width * o.height * 4
  );
}

export function rawToRaster(img: RawImage): Raster {
  const bpp = img.format === "rgba" ? 4 : 1;
  if (
    !Number.isInteger(img.width) ||
    !Number.isInteger(img.height) ||
    img.width <= 0 ||
    img.height <= 0
  ) {
    throw new ScanError("INVALID_INPUT", `Dimensiones inválidas: ${img.width}x${img.height}`);
  }
  if (img.data.length < img.width * img.height * bpp) {
    throw new ScanError(
      "INVALID_INPUT",
      `Buffer demasiado corto para ${img.width}x${img.height} ${img.format}`,
    );
  }
  return {
    kind: img.format,
    data: img.data,
    width: img.width,
    height: img.height,
    stride: img.width * bpp,
  };
}

export function rgbaToRaster(d: {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}): Raster {
  return { kind: "rgba", data: d.data, width: d.width, height: d.height, stride: d.width * 4 };
}

export function checkPixels(width: number, height: number, max = 16e6): void {
  if (width * height > max) {
    throw new ScanError(
      "INVALID_INPUT",
      `Imagen de ${width}x${height} (${((width * height) / 1e6).toFixed(1)} MP) supera maxInputPixels=${max / 1e6} MP`,
    );
  }
}

export type EncodedKind = "png" | "jpeg" | "webp" | "gif" | "unknown";

export function sniff(b: Uint8Array): EncodedKind {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0xff && b[1] === 0xd8) return "jpeg";
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45
  )
    return "webp";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "gif";
  return "unknown";
}
