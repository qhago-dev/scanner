import type { Raster } from "../engine/engine";
import { ScanError } from "../errors";
import { type ImageInput, isImageDataLike, isRawImage, rawToRaster, rgbaToRaster } from "./common";

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
let canvas: OffscreenCanvas | HTMLCanvasElement | null = null;
let ctx: Canvas2D | null = null;

/** Canvas reutilizable (OffscreenCanvas en workers; <canvas> como fallback en main thread). */
function context(w: number, h: number): Canvas2D {
  if (!canvas) {
    canvas =
      typeof OffscreenCanvas === "function"
        ? new OffscreenCanvas(w, h)
        : document.createElement("canvas");
    ctx = canvas.getContext("2d", { willReadFrequently: true }) as Canvas2D | null;
    if (!ctx) throw new ScanError("UNSUPPORTED", "No hay contexto 2D de canvas disponible");
  }
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  return ctx as Canvas2D;
}

function sourceSize(src: CanvasImageSource | VideoFrame): [number, number] {
  if (typeof VideoFrame === "function" && src instanceof VideoFrame)
    return [src.displayWidth, src.displayHeight];
  if (typeof HTMLVideoElement === "function" && src instanceof HTMLVideoElement)
    return [src.videoWidth, src.videoHeight];
  if (typeof HTMLImageElement === "function" && src instanceof HTMLImageElement)
    return [src.naturalWidth, src.naturalHeight];
  if (typeof SVGImageElement === "function" && src instanceof SVGImageElement) {
    return [src.width.baseVal.value, src.height.baseVal.value];
  }
  const s = src as { width: number; height: number };
  return [s.width, s.height];
}

function rasterize(src: CanvasImageSource | VideoFrame): Raster {
  const [w, h] = sourceSize(src);
  if (!w || !h)
    throw new ScanError("INVALID_INPUT", "La imagen no tiene dimensiones (¿no ha cargado aún?)");
  const c = context(w, h);
  c.drawImage(src as CanvasImageSource, 0, 0, w, h);
  return rgbaToRaster(c.getImageData(0, 0, w, h));
}

const YUV = new Set(["I420", "I420A", "I422", "I444", "NV12"]);

/** VideoFrame en YUV: el plano Y ya es luminancia → sin conversión de color ni canvas. */
async function fromVideoFrame(f: VideoFrame): Promise<Raster> {
  if (f.format && YUV.has(f.format)) {
    const rect = f.visibleRect ?? { x: 0, y: 0, width: f.codedWidth, height: f.codedHeight };
    const buf = new Uint8Array(f.allocationSize({ rect }));
    const layout = await f.copyTo(buf, { rect });
    const y = layout[0];
    if (y) {
      return {
        kind: "luma",
        data: buf.subarray(y.offset),
        width: rect.width,
        height: rect.height,
        stride: y.stride,
      };
    }
  }
  return rasterize(f);
}

export async function toRaster(input: ImageInput): Promise<Raster> {
  if (isRawImage(input)) return rawToRaster(input);
  if (isImageDataLike(input)) return rgbaToRaster(input);
  if (typeof VideoFrame === "function" && input instanceof VideoFrame) return fromVideoFrame(input);
  if (input instanceof ArrayBuffer || input instanceof Uint8Array) {
    return toRaster(new Blob([input as BlobPart]));
  }
  if (typeof Blob === "function" && input instanceof Blob) {
    let bmp: ImageBitmap;
    try {
      bmp = await createImageBitmap(input, { imageOrientation: "from-image" });
    } catch (e) {
      throw new ScanError(
        "INVALID_INPUT",
        "No se pudo decodificar la imagen (formato no soportado por el navegador)",
        {
          cause: e,
        },
      );
    }
    try {
      return rasterize(bmp);
    } finally {
      bmp.close();
    }
  }
  if (
    typeof HTMLImageElement === "function" &&
    input instanceof HTMLImageElement &&
    !input.complete
  ) {
    await input.decode();
  }
  return rasterize(input as CanvasImageSource);
}
