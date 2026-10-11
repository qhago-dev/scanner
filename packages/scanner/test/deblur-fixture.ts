// Imágenes y perfiles EAN-13 sintéticos desenfocados (tests del lector deblur).
import { _test } from "../src/deblur/ean";
import type { Raster } from "../src/engine/engine";

const { L, G, R, PARITY } = _test;

export function modules(code: string): string {
  const d = Array.from(code, Number);
  let s = "101";
  for (let i = 0; i < 6; i++)
    s += ((PARITY[d[0] as number] as string)[i] === "L" ? L : G)[d[i + 1] as number];
  s += "01010";
  for (let i = 0; i < 6; i++) s += R[d[7 + i] as number];
  return `${s}101`;
}

/** Imagen sintética: EAN-13 horizontal desenfocado (caja + Gauss separable), con ruido opcional. */
export function image(code: string, w: number, sigmaMod: number, noise = 0, angleDeg = 0): Raster {
  const bits = modules(code);
  const W = 720;
  const H = 1280; // como una foto vertical del celular: el código ocupa una parte pequeña
  const x0 = (W - 95 * w) / 2;
  const sig = sigmaMod * w;
  // fila nítida (barras = 1) convolucionada con un gaussiano de σ = sigmaMod módulos
  const crisp = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const m = Math.floor((x + 0.5 - x0) / w);
    crisp[x] = m >= 0 && m < 95 && bits[m] === "1" ? 1 : 0;
  }
  const rad = Math.ceil(3 * sig);
  const ker = Array.from({ length: 2 * rad + 1 }, (_, i) =>
    Math.exp(-((i - rad) ** 2) / (2 * sig * sig)),
  );
  const ks = ker.reduce((s, v) => s + v, 0);
  const row = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    let v = 0;
    for (let k = -rad; k <= rad; k++)
      v += (crisp[Math.min(W - 1, Math.max(0, x + k))] as number) * (ker[k + rad] as number);
    row[x] = v / ks;
  }
  const data = new Uint8Array(W * H);
  const a = (angleDeg * Math.PI) / 180;
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff - 0.5;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const xr = Math.round((x - W / 2) * Math.cos(a) + (y - H / 2) * Math.sin(a) + W / 2);
      const inBar = y > 580 && y < 700 && xr >= 0 && xr < W;
      const v = inBar ? (row[xr] as number) : 0;
      data[y * W + x] = Math.max(0, Math.min(255, 230 - 200 * Math.min(1, v) + noise * rnd()));
    }
  return { kind: "luma", data, width: W, height: H, stride: W };
}
