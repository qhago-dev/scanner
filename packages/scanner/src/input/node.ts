import type { Engine, Raster } from "../engine/engine";
import { ScanError } from "../errors";
import {
  type ImageInput,
  isImageDataLike,
  isRawImage,
  rawToRaster,
  rgbaToRaster,
  sniff,
} from "./common";

export async function toRaster(input: ImageInput, engine: Engine): Promise<Raster> {
  if (isRawImage(input)) return rawToRaster(input);
  if (isImageDataLike(input)) return rgbaToRaster(input);
  let bytes: Uint8Array | null = null;
  if (input instanceof Uint8Array) bytes = input;
  else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
  else if (typeof Blob === "function" && input instanceof Blob)
    bytes = new Uint8Array(await input.arrayBuffer());
  if (!bytes) {
    throw new ScanError(
      "INVALID_INPUT",
      "En Node/Bun decode() acepta Buffer/Uint8Array/ArrayBuffer (PNG o JPEG), Blob, ImageData-like o { data, width, height, format }",
    );
  }
  const kind = sniff(bytes);
  if (kind !== "png" && kind !== "jpeg") {
    throw new ScanError(
      "INVALID_INPUT",
      kind === "unknown"
        ? "Formato de imagen no reconocido: en Node/Bun se aceptan PNG y JPEG"
        : `${kind.toUpperCase()} no está soportado en Node/Bun: conviértelo antes a PNG/JPEG (p. ej. con sharp)`,
    );
  }
  const raster = engine.decodeEncoded(bytes);
  if (!raster)
    throw new ScanError("INVALID_INPUT", `No se pudo decodificar la imagen: ${engine.lastError()}`);
  return raster;
}
