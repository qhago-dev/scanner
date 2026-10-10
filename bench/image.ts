import { readFileSync } from "node:fs";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

export interface Rgba {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Decodifica PNG/JPEG a RGBA (mismos píxeles para todos los motores). */
export function loadRgba(path: string): Rgba {
  const buf = readFileSync(path);
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    const p = PNG.sync.read(buf);
    return {
      data: new Uint8ClampedArray(p.data.buffer, p.data.byteOffset, p.data.byteLength),
      width: p.width,
      height: p.height,
    };
  }
  const j = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
  return {
    data: new Uint8ClampedArray(j.data.buffer, j.data.byteOffset, j.data.byteLength),
    width: j.width,
    height: j.height,
  };
}

export function toLuma(img: Rgba): Uint8ClampedArray {
  const out = new Uint8ClampedArray(img.width * img.height);
  const d = img.data;
  for (let i = 0; i < out.length; i++)
    out[i] = ((d[i * 4] ?? 0) * 77 + (d[i * 4 + 1] ?? 0) * 150 + (d[i * 4 + 2] ?? 0) * 29) >> 8;
  return out;
}
