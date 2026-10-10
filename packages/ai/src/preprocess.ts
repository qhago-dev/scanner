import { INPUT, PAD } from "./model";

/** Raster tal como lo recibe un plugin (ver PluginRaster en @qhago/scanner/worker-host). */
export interface LumaSource {
  kind: "luma" | "rgba";
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  stride: number;
}

export interface Letterbox {
  scale: number;
  padX: number;
  padY: number;
}

/**
 * Letterbox a INPUT×INPUT en escala de grises [0,1], NCHW (1×1×H×W), con promedio por área al reducir
 * (equivalente a cv2.INTER_AREA del entrenamiento). Reutiliza `out` si se pasa.
 */
export function letterbox(
  src: LumaSource,
  out = new Float32Array(INPUT * INPUT),
): [Float32Array, Letterbox] {
  const { width: w, height: h } = src;
  const scale = INPUT / Math.max(w, h);
  const nw = Math.round(w * scale);
  const nh = Math.round(h * scale);
  const padX = Math.floor((INPUT - nw) / 2);
  const padY = Math.floor((INPUT - nh) / 2);
  out.fill(PAD);
  const rgba = src.kind === "rgba";
  const d = src.data;
  const lum = (x: number, y: number): number => {
    const i = y * src.stride + x * (rgba ? 4 : 1);
    return rgba
      ? (77 * (d[i] as number) + 150 * (d[i + 1] as number) + 29 * (d[i + 2] as number)) >> 8
      : (d[i] as number);
  };
  const inv = 1 / scale;
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor(y * inv);
    const y1 = Math.min(h, Math.max(y0 + 1, Math.floor((y + 1) * inv)));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * inv);
      const x1 = Math.min(w, Math.max(x0 + 1, Math.floor((x + 1) * inv)));
      let sum = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) sum += lum(xx, yy);
      out[(y + padY) * INPUT + x + padX] = sum / ((y1 - y0) * (x1 - x0) * 255);
    }
  }
  return [out, { scale, padX, padY }];
}

/** float32 → bits de float16 (para modelos FP16 sin Float16Array). */
export function toHalf(src: Float32Array, out = new Uint16Array(src.length)): Uint16Array {
  const f = new Float32Array(1);
  const u = new Uint32Array(f.buffer);
  for (let i = 0; i < src.length; i++) {
    f[0] = src[i] as number;
    const x = u[0] as number;
    const sign = (x >>> 16) & 0x8000;
    const exp = ((x >>> 23) & 0xff) - 127 + 15;
    const mant = x & 0x7fffff;
    if (exp <= 0) out[i] = sign | (exp < -10 ? 0 : ((mant | 0x800000) >> (1 - exp)) >> 13);
    else if (exp >= 31) out[i] = sign | 0x7c00;
    else out[i] = sign | (exp << 10) | (mant >> 13);
  }
  return out;
}

export function fromHalf(h: number): number {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const m = h & 0x3ff;
  if (e === 0) return s * 2 ** -14 * (m / 1024);
  if (e === 31) return m ? Number.NaN : s * Number.POSITIVE_INFINITY;
  return s * 2 ** (e - 15) * (1 + m / 1024);
}
