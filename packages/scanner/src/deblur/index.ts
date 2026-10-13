// Lector EAN-13/UPC-A para códigos desenfocados (fase 9, M4). Ver ean.ts.
import type { Raster } from "../engine/engine";
import type { BarcodeResult, Point } from "../types";
import { fitSpans } from "./ean";
import { locate1D, profileAt, type Region1D } from "./locate";
import { findSpans, normalize } from "./span";

export interface DeblurOptions {
  /** Regiones a probar; si no se dan, se localizan con el tensor de estructura. */
  regions?: Region1D[];
  maxRegions?: number;
  /** Líneas por región (se reparten a lo alto de las barras). */
  lines?: number;
  /** Alturas concretas (0..1) a lo largo de las barras; sustituye a `lines`. */
  fracs?: number[];
  /**
   * Si las `gateLines` primeras líneas no llegan a `gateFit` de ajuste, se abandona la región (fase 10, latencia:
   * en la cola de public/dev ahorra ~40 % de las líneas sin perder regiones aceptables; 0,6 y no 0,7 porque con 0,7
   * se perdía una foto real del Android cuyas líneas centrales eran las malas). 0 lo desactiva.
   */
  gateLines?: number;
  gateFit?: number;
  /** Umbrales de aceptación (medidos en fotos reales: correctas ≥ 0,86, falsas ≤ 0,85). */
  minFit?: number;
  minMargin?: number;
  /** Líneas que deben coincidir. */
  minVotes?: number;
  /** "full" (fotos) o "fast" (cámara: búsqueda de geometría reducida). */
  mode?: "full" | "fast";
  /**
   * Unanimidad (fase 10, regiones propuestas por la IA): se prueban todas las líneas (sin corte temprano) y se
   * descarta la región si alguna línea con buen ajuste da otro número.
   */
  unanimous?: boolean;
}

const enc = new TextEncoder();

/** Devuelve como mucho un EAN-13 por región, solo si ≥ minVotes líneas coinciden y ninguna discrepa tanto. */
export function readBlurredEan(r: Raster, o: DeblurOptions = {}): BarcodeResult[] {
  const regions = o.regions ?? locate1D(r, o.maxRegions ?? 2);
  const n = o.lines ?? 5;
  // Alturas a lo largo de las barras, del centro hacia fuera: las centrales son las que más leen (las de los
  // extremos caen a veces fuera de las barras), así que deciden antes si la región merece el resto.
  const fracs =
    o.fracs ??
    Array.from({ length: n }, (_, li) => (n === 1 ? 0.5 : 0.15 + (0.7 * li) / (n - 1))).sort(
      (x, y) => Math.abs(x - 0.5) - Math.abs(y - 0.5) || x - y,
    );
  const lines = fracs.length;
  const minFit = o.minFit ?? 0.85;
  const minMargin = o.minMargin ?? 0.8;
  const minVotes = o.minVotes ?? 2;
  const out: BarcodeResult[] = [];
  for (const g of regions) {
    const votes = new Map<
      string,
      { n: number; fit: number; a: number; b: number; frac: number[] }
    >();
    let other = 0;
    let bestSoFar = 0;
    const gateLines = o.gateLines ?? ((o.mode ?? "full") === "full" ? 2 : 0);
    const gateFit = o.gateFit ?? 0.6;
    for (let li = 0; li < lines; li++) {
      if (gateLines > 0 && li === gateLines && bestSoFar < gateFit) break;
      const frac = fracs[li] as number;
      const prof = profileAt(r, g, frac);
      if (!prof) continue;
      const q = normalize(prof);
      if (!q) continue;
      const best = fitSpans(q, findSpans(q), o.mode ?? "full");
      if (!best) continue;
      bestSoFar = Math.max(bestSoFar, best.fit);
      if (best.fit >= minFit && best.margin >= minMargin) {
        const v = votes.get(best.text) ?? { n: 0, fit: 0, a: best.start, b: best.end, frac: [] };
        v.n++;
        v.fit = Math.max(v.fit, best.fit);
        v.frac.push(frac);
        votes.set(best.text, v);
        // corte temprano: dos líneas de acuerdo bastan
        if (!o.unanimous && v.n >= minVotes && other === 0) break;
      } else if (best.fit >= minFit) other++;
    }
    const ranked = [...votes.entries()].sort((x, y) => y[1].n - x[1].n);
    const top = ranked[0];
    if (!top) continue;
    const rest = ranked.slice(1).reduce((s, [, v]) => s + v.n, 0);
    if (top[1].n < minVotes || top[1].n < 2 * rest) continue;
    if (o.unanimous && (rest > 0 || other > 0)) continue;
    out.push(toResult(top[0], g, top[1], prof0Len(g)));
  }
  return out;
}

const prof0Len = (g: Region1D) => Math.floor((g.u1 - g.u0) * 1.5 * 2);

function toResult(
  text: string,
  g: Region1D,
  v: { a: number; b: number; fit: number; frac: number[] },
  n: number,
): BarcodeResult {
  // índice del perfil → coordenada u (2 muestras/px desde u0 − 25 %)
  const ext = (g.u1 - g.u0) * 0.25;
  const u0 = g.u0 - ext;
  const u1 = g.u1 + ext;
  const toU = (k: number) => u0 + ((u1 - u0) * k) / (n - 1);
  const ua = toU(v.a);
  const ub = toU(v.b);
  const vx = -g.uy;
  const vy = g.ux;
  const pt = (u: number, vv: number): Point => ({
    x: g.cx + u * g.ux + vv * vx,
    y: g.cy + u * g.uy + vv * vy,
  });
  const c = [pt(ua, g.v0), pt(ub, g.v0), pt(ub, g.v1), pt(ua, g.v1)] as [
    Point,
    Point,
    Point,
    Point,
  ];
  const xs = c.map((p) => p.x);
  const ys = c.map((p) => p.y);
  const bx = Math.min(...xs);
  const by = Math.min(...ys);
  return {
    format: "ean_13",
    text,
    bytes: enc.encode(text),
    cornerPoints: c,
    boundingBox: { x: bx, y: by, width: Math.max(...xs) - bx, height: Math.max(...ys) - by },
    orientation: Math.round((Math.atan2(g.uy, g.ux) * 180) / Math.PI),
    isMirrored: false,
    isInverted: false,
    contentType: "text",
    symbologyIdentifier: "]E0",
    ecLevel: "",
    confidence: Math.min(1, 0.5 + v.fit / 2),
  } as BarcodeResult;
}

export type { Region1D };
