import { CORNER_SCALE, GRID, NUM_CLASSES, STRIDE } from "./model";
import type { Letterbox } from "./preprocess";

export interface Point {
  x: number;
  y: number;
}

export interface Detection {
  cls: number;
  score: number;
  /** 4 esquinas en píxeles de la imagen original. */
  corners: [Point, Point, Point, Point];
}

/**
 * Picos locales del heatmap (máximo 3×3, como el max-pool de CenterNet) por encima de `thr`, top-`k`,
 * con supresión entre clases en la misma celda vecina. Equivale a `decode()` de centernet_lite.py.
 */
export function decodePeaks(
  heat: ArrayLike<number>,
  offset: ArrayLike<number>,
  corners: ArrayLike<number>,
  lb: Letterbox,
  thr = 0.4,
  k = 5,
): Detection[] {
  const G = GRID;
  const cand: { cls: number; x: number; y: number; score: number }[] = [];
  for (let c = 0; c < NUM_CLASSES; c++) {
    const base = c * G * G;
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const v = heat[base + y * G + x] as number;
        if (v < thr) continue;
        let peak = true;
        for (let dy = -1; dy <= 1 && peak; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const yy = y + dy;
            const xx = x + dx;
            if (
              (dx || dy) &&
              yy >= 0 &&
              xx >= 0 &&
              yy < G &&
              xx < G &&
              (heat[base + yy * G + xx] as number) > v
            ) {
              peak = false;
              break;
            }
          }
        }
        if (peak) cand.push({ cls: c, x, y, score: v });
      }
    }
  }
  cand.sort((a, b) => b.score - a.score);
  const kept: typeof cand = [];
  for (const p of cand) {
    if (kept.some((q) => Math.abs(q.x - p.x) <= 1 && Math.abs(q.y - p.y) <= 1)) continue;
    kept.push(p);
    if (kept.length >= k) break;
  }
  const at = (t: ArrayLike<number>, ch: number, x: number, y: number) =>
    t[ch * G * G + y * G + x] as number;
  return kept.map(({ cls, x, y, score }) => {
    const cx = (x + at(offset, 0, x, y)) * STRIDE;
    const cy = (y + at(offset, 1, x, y)) * STRIDE;
    const pts = [0, 1, 2, 3].map((i) => ({
      x: (cx + at(corners, 2 * i, x, y) * CORNER_SCALE - lb.padX) / lb.scale,
      y: (cy + at(corners, 2 * i + 1, x, y) * CORNER_SCALE - lb.padY) / lb.scale,
    })) as [Point, Point, Point, Point];
    return { cls, score, corners: pts };
  });
}
