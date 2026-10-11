// Localización barata de códigos 1D: tensor de estructura sobre la imagen reducida (energía de gradiente alta
// y orientación coherente), componentes conexas → centro, orientación y extensión de cada candidato.
import type { Raster } from "../engine/engine";

export interface Region1D {
  /** Centro (px del raster). */
  cx: number;
  cy: number;
  /** Dirección a través de las barras (unitaria). */
  ux: number;
  uy: number;
  /** Extensión a lo largo de u (u0 < 0 < u1) y de las barras (v0 < v1), en px relativos al centro. */
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  score: number;
}

export function luma(r: Raster): (x: number, y: number) => number {
  const d = r.data;
  if (r.kind === "luma") return (x, y) => d[y * r.stride + x] as number;
  return (x, y) => {
    const i = y * r.stride + x * 4;
    return (77 * (d[i] as number) + 150 * (d[i + 1] as number) + 29 * (d[i + 2] as number)) >> 8;
  };
}

/** Caja integral para blur de caja rápido. */
function boxBlur(src: Float32Array, w: number, h: number, rad: number): Float32Array {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += src[y * w + x] as number;
      I[(y + 1) * (w + 1) + x + 1] = (I[y * (w + 1) + x + 1] as number) + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - rad);
    const y1 = Math.min(h, y + rad + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - rad);
      const x1 = Math.min(w, x + rad + 1);
      const s =
        (I[y1 * (w + 1) + x1] as number) -
        (I[y0 * (w + 1) + x1] as number) -
        (I[y1 * (w + 1) + x0] as number) +
        (I[y0 * (w + 1) + x0] as number);
      out[y * w + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

function morph(m: Uint8Array, w: number, h: number, rad: number, dilate: boolean): Uint8Array {
  // separable: horizontal y luego vertical
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  const v = dilate ? 1 : 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = dilate ? 0 : 1;
      for (let k = Math.max(0, x - rad); k <= Math.min(w - 1, x + rad); k++)
        if ((m[y * w + k] as number) === v) {
          r = v;
          break;
        }
      tmp[y * w + x] = r;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = dilate ? 0 : 1;
      for (let k = Math.max(0, y - rad); k <= Math.min(h - 1, y + rad); k++)
        if ((tmp[k * w + x] as number) === v) {
          r = v;
          break;
        }
      out[y * w + x] = r;
    }
  return out;
}

function percentile(a: Float32Array, p: number): number {
  // muestreo para no ordenar todo
  const step = Math.max(1, Math.floor(a.length / 4096));
  const s: number[] = [];
  for (let i = 0; i < a.length; i += step) s.push(a[i] as number);
  s.sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] as number;
}

/** Hasta `max` regiones candidatas, ordenadas por (área × energía). */
export function locate1D(r: Raster, max = 2, side = 480): Region1D[] {
  const sc = Math.min(1, side / Math.max(r.width, r.height));
  const w = Math.max(8, Math.round(r.width * sc));
  const h = Math.max(8, Math.round(r.height * sc));
  const lum = luma(r);
  const g = new Float32Array(w * h);
  const inv = 1 / sc;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * inv);
    const y1 = Math.min(r.height, Math.max(y0 + 1, Math.floor((y + 1) * inv)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * inv);
      const x1 = Math.min(r.width, Math.max(x0 + 1, Math.floor((x + 1) * inv)));
      let s = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) s += lum(xx, yy);
      g[y * w + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  const jxx = new Float32Array(w * h);
  const jyy = new Float32Array(w * h);
  const jxy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        (g[i - w + 1] as number) +
        2 * (g[i + 1] as number) +
        (g[i + w + 1] as number) -
        (g[i - w - 1] as number) -
        2 * (g[i - 1] as number) -
        (g[i + w - 1] as number);
      const gy =
        (g[i + w - 1] as number) +
        2 * (g[i + w] as number) +
        (g[i + w + 1] as number) -
        (g[i - w - 1] as number) -
        2 * (g[i - w] as number) -
        (g[i - w + 1] as number);
      jxx[i] = gx * gx;
      jyy[i] = gy * gy;
      jxy[i] = gx * gy;
    }
  const bxx = boxBlur(jxx, w, h, 4);
  const byy = boxBlur(jyy, w, h, 4);
  const bxy = boxBlur(jxy, w, h, 4);
  const e = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) e[i] = (bxx[i] as number) + (byy[i] as number);
  // Umbral relativo a los bordes más fuertes: con el percentil 85 solo, un código grande se cortaba en trozos.
  const thr = percentile(e, 0.85);
  let mask: Uint8Array = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const ee = e[i] as number;
    if (ee <= thr || ee < 1) continue;
    const a = (bxx[i] as number) - (byy[i] as number);
    const coh = Math.sqrt(a * a + 4 * (bxy[i] as number) ** 2) / (ee + 1e-6);
    if (coh > 0.75) mask[i] = 1;
  }
  mask = morph(morph(mask, w, h, 3, true), w, h, 3, false); // cierre 7×7
  mask = morph(morph(mask, w, h, 1, false), w, h, 1, true); // apertura 3×3
  // componentes conexas (4-vecindad)
  const lab = new Int32Array(w * h);
  const regs: Region1D[] = [];
  const stack: number[] = [];
  let next = 0;
  for (let s0 = 0; s0 < w * h; s0++) {
    if (!mask[s0] || lab[s0]) continue;
    next++;
    stack.push(s0);
    lab[s0] = next;
    const pts: number[] = [];
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    let se = 0;
    while (stack.length) {
      const i = stack.pop() as number;
      pts.push(i);
      sxx += bxx[i] as number;
      syy += byy[i] as number;
      sxy += bxy[i] as number;
      se += e[i] as number;
      const x = i % w;
      const yy = (i - x) / w;
      for (const j of [
        x > 0 ? i - 1 : -1,
        x < w - 1 ? i + 1 : -1,
        yy > 0 ? i - w : -1,
        yy < h - 1 ? i + w : -1,
      ])
        if (j >= 0 && mask[j] && !lab[j]) {
          lab[j] = next;
          stack.push(j);
        }
    }
    if (pts.length < (150 * (w * h)) / (480 * 270)) continue;
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const ux = Math.cos(th);
    const uy = Math.sin(th);
    let cx = 0;
    let cy = 0;
    for (const i of pts) {
      cx += i % w;
      cy += Math.floor(i / w);
    }
    cx /= pts.length;
    cy /= pts.length;
    const pu = new Float32Array(pts.length);
    const pv = new Float32Array(pts.length);
    pts.forEach((i, k) => {
      const dx = (i % w) - cx;
      const dy = Math.floor(i / w) - cy;
      pu[k] = dx * ux + dy * uy;
      pv[k] = -dx * uy + dy * ux;
    });
    const srt = (a: Float32Array) => Float32Array.from(a).sort();
    const su = srt(pu);
    const sv = srt(pv);
    const at = (a: Float32Array, p: number) =>
      a[Math.min(a.length - 1, Math.floor(p * a.length))] as number;
    regs.push({
      cx: (cx + 0.5) * inv,
      cy: (cy + 0.5) * inv,
      ux,
      uy,
      u0: at(su, 0.01) * inv,
      u1: at(su, 0.99) * inv,
      v0: at(sv, 0.1) * inv,
      v1: at(sv, 0.9) * inv,
      score: pts.length * (se / pts.length),
    });
  }
  regs.sort((a, b) => b.score - a.score);
  return regs.slice(0, max);
}

/** Perfil a lo largo de u (2 muestras/px), promediado en una banda de 5 px a lo largo de las barras. */
export function profileAt(
  r: Raster,
  g: Region1D,
  frac: number,
  sign: 1 | -1 = 1,
): Float32Array | null {
  const lum = luma(r);
  const ext = (g.u1 - g.u0) * 0.25;
  const u0 = g.u0 - ext;
  const u1 = g.u1 + ext;
  const n = Math.floor((u1 - u0) * 2);
  if (n < 100) return null;
  const v = g.v0 + (g.v1 - g.v0) * frac;
  const vx = -g.uy;
  const vy = g.ux;
  const out = new Float32Array(n);
  const W = r.width - 1;
  const H = r.height - 1;
  for (let k = 0; k < n; k++) {
    const t = sign > 0 ? u0 + ((u1 - u0) * k) / (n - 1) : u1 - ((u1 - u0) * k) / (n - 1);
    let s = 0;
    for (let dv = -2; dv <= 2; dv++) {
      const x = Math.min(W, Math.max(0, g.cx + t * g.ux + (v + dv) * vx));
      const yy = Math.min(H, Math.max(0, g.cy + t * g.uy + (v + dv) * vy));
      const x0 = Math.floor(x);
      const y0 = Math.floor(yy);
      const fx = x - x0;
      const fy = yy - y0;
      const x1 = Math.min(W, x0 + 1);
      const y1 = Math.min(H, y0 + 1);
      s +=
        lum(x0, y0) * (1 - fx) * (1 - fy) +
        lum(x1, y0) * fx * (1 - fy) +
        lum(x0, y1) * (1 - fx) * fy +
        lum(x1, y1) * fx * fy;
    }
    out[k] = s / 5;
  }
  return out;
}
