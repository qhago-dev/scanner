import { isLinear } from "./formats";
import type { BarcodeResult, Point } from "./types";

/**
 * Lecturas lineales contradictorias: dos resultados 1D con distinto contenido sobre el mismo símbolo
 * (misma recta de barrido, desplazados en perpendicular menos de media longitud) significan que al menos
 * uno es falso, y el checksum no dice cuál (EAN tiene 1 dígito de control: ~10 % de falsos lo pasan).
 * Si uno tiene un consenso claramente mayor (alto del quad = líneas de barrido que coinciden: ≥ 15 % de
 * la longitud y ≥ 4× el siguiente) se conserva; si no, se descartan todos: mejor no leer que inventar.
 * Medido en fotos reales de Android, donde "harder" devolvía 2 EAN-13 válidos y distintos de 2-9 px de
 * alto sobre un código borroso.
 */
export function dropConflicts(results: BarcodeResult[]): BarcodeResult[] {
  const n = results.length;
  if (n < 2) return results;
  // Componentes conexas del grafo de conflictos (union-find).
  const parent = results.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r] as number;
    return r;
  };
  let any = false;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const a = results[i] as BarcodeResult;
      const b = results[j] as BarcodeResult;
      if (!isLinear(a.format) || !isLinear(b.format) || a.text === b.text) continue;
      if (sameSymbol(a.cornerPoints, b.cornerPoints)) {
        parent[find(i)] = find(j);
        any = true;
      }
    }
  if (!any) return results;
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) groups.set(find(i), [...(groups.get(find(i)) ?? []), i]);
  const keep = new Set<number>();
  for (const idx of groups.values()) {
    if (idx.length === 1) {
      keep.add(idx[0] as number);
      continue;
    }
    // Grosor por contenido (líneas del mismo texto se suman como consenso).
    const byText = new Map<string, { t: number; len: number; idx: number[] }>();
    for (const i of idx) {
      const r = results[i] as BarcodeResult;
      const ax = axis(r.cornerPoints);
      const e = byText.get(r.text) ?? { t: 0, len: ax.len, idx: [] };
      e.t += ax.thick;
      e.len = Math.max(e.len, ax.len);
      e.idx.push(i);
      byText.set(r.text, e);
    }
    const [best, second] = [...byText.values()].sort((x, y) => y.t - x.t);
    if (best && second && best.t >= 0.15 * best.len && best.t >= 4 * second.t)
      for (const i of best.idx) keep.add(i);
  }
  return results.filter((_, i) => keep.has(i));
}

/** Eje de lectura de un quad 1D: centro, dirección unitaria, longitud (lado largo) y grosor (lado corto). */
function axis(q: readonly Point[]) {
  const [p0, p1, p2, p3] = q as [Point, Point, Point, Point];
  const c = { x: (p0.x + p1.x + p2.x + p3.x) / 4, y: (p0.y + p1.y + p2.y + p3.y) / 4 };
  const top = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const side = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  const [u, len] =
    top >= side
      ? [{ x: p1.x - p0.x, y: p1.y - p0.y }, top]
      : [{ x: p3.x - p0.x, y: p3.y - p0.y }, side];
  return { c, u: { x: u.x / (len || 1), y: u.y / (len || 1) }, len, thick: Math.min(top, side) };
}

function sameSymbol(qa: readonly Point[], qb: readonly Point[]): boolean {
  if (qa.length < 4 || qb.length < 4) return false;
  const a = axis(qa);
  const b = axis(qb);
  if (Math.abs(a.u.x * b.u.x + a.u.y * b.u.y) < 0.9) return false; // no paralelos (> ~25°)
  const len = Math.min(a.len, b.len);
  const d = { x: b.c.x - a.c.x, y: b.c.y - a.c.y };
  const along = Math.abs(d.x * a.u.x + d.y * a.u.y);
  const perp = Math.abs(-d.x * a.u.y + d.y * a.u.x);
  return along < 0.4 * len && perp < 0.5 * len;
}

const VIEW_PADS = [0.6, 1.5];
const EAN_UPC = new Set<BarcodeResult["format"]>(["ean_13", "ean_8", "upc_a", "upc_e"]);

/** GTIN comparable entre EAN-13 / UPC-A (el 0 inicial) para no tomar como conflicto el mismo código. */
const gtin = (t: string) => t.replace(/^0+/, "");

/**
 * EAN/UPC hallados solo por las pasadas "harder" (más líneas, rotación, preproceso): en fotos reales de
 * envases arrugados ZXing devuelve ahí lecturas falsas con checksum válido de forma consistente en todas
 * las líneas (también zxing-wasm upstream), mientras que una relectura *normal* ampliada de la zona da el
 * valor real. Se relee la zona sin "harder" (x1, x2, x0,5) con varios márgenes: si alguna vista da otro
 * número, el resultado se descarta.
 * `reread(region)` devuelve las lecturas normales de esa región.
 */
export function verifyHarder(
  results: BarcodeResult[],
  passes: readonly string[],
  size: { width: number; height: number },
  reread: (region: { x: number; y: number; width: number; height: number }) => BarcodeResult[],
): BarcodeResult[] {
  return results.filter((r, i) => {
    if (!EAN_UPC.has(r.format) || (passes[i] ?? "fast") === "fast") return true;
    const b = r.boundingBox;
    const long = Math.max(b.width, b.height);
    // Varias vistas: la lectura falsa aparece o no según el recorte; basta una discrepancia.
    for (const k of VIEW_PADS) {
      const pad = k * long;
      const x = Math.max(0, Math.floor(b.x - pad));
      const y = Math.max(0, Math.floor(b.y - pad));
      const region = {
        x,
        y,
        width: Math.min(size.width, Math.ceil(b.x + b.width + pad)) - x,
        height: Math.min(size.height, Math.ceil(b.y + b.height + pad)) - y,
      };
      if (region.width < 8 || region.height < 8) continue;
      if (reread(region).some((v) => EAN_UPC.has(v.format) && gtin(v.text) !== gtin(r.text)))
        return false;
    }
    return true;
  });
}
