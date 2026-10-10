import type { BarcodeFormat, Point, Rect } from "../types";

export interface Observation {
  format: BarcodeFormat;
  corners: [Point, Point, Point, Point];
  /** Clave de contenido (formato + bytes) o null si es un símbolo sin leer. */
  key: string | null;
}

export interface Track {
  id: number;
  kind: "read" | "unread";
  format: BarcodeFormat;
  box: Rect;
  key: string | null;
  lastSeen: number;
  /** Frames consecutivos en los que un track `unread` no se pudo leer. */
  failures: number;
}

/**
 * Caja de seguimiento. En 2D, la de las 4 esquinas. En 1D, si la posición es casi una línea,
 * se expande perpendicularmente 0,3 × longitud (F3 diseño): así la asociación por IoU funciona.
 */
export function trackingBox(corners: readonly Point[]): Rect {
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  let x = Math.min(...xs);
  let y = Math.min(...ys);
  let w = Math.max(...xs) - x;
  let h = Math.max(...ys) - y;
  const len = Math.max(w, h);
  const thin = Math.min(w, h);
  if (len > 0 && thin < 0.15 * len) {
    const pad = (0.3 * len - thin) / 2;
    if (w >= h) {
      y -= pad;
      h += 2 * pad;
    } else {
      x -= pad;
      w += 2 * pad;
    }
  }
  return { x, y, width: w, height: h };
}

export function iou(a: Rect, b: Rect): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

const center = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** Asociación greedy entre frames: IoU ≥ 0,3 o (centro cercano y mismo formato). */
export class Tracker {
  private tracks: Track[] = [];
  private nextId = 1;

  constructor(private readonly lostAfterMs = 500) {}

  /** Asocia las observaciones del frame; devuelve el track de cada una (mismo orden) y los perdidos. */
  update(obs: Observation[], now: number): { assigned: Track[]; lost: Track[] } {
    const free = new Set(this.tracks);
    const assigned: Track[] = [];
    for (const o of obs) {
      const box = trackingBox(o.corners);
      let best: Track | null = null;
      let bestScore = 0;
      for (const t of free) {
        const ov = iou(t.box, box);
        const c1 = center(t.box);
        const c2 = center(box);
        const diag = Math.hypot(t.box.width, t.box.height);
        const near = t.format === o.format && Math.hypot(c1.x - c2.x, c1.y - c2.y) < 0.5 * diag;
        // Mismo contenido en otra posición sin solape = otro objeto (p. ej. dos productos iguales).
        const score = ov >= 0.3 ? 1 + ov : near ? 0.5 : 0;
        if (score > bestScore) {
          best = t;
          bestScore = score;
        }
      }
      if (best) {
        free.delete(best);
        best.box = box;
        best.format = o.format;
        best.lastSeen = now;
        if (o.key) {
          best.kind = "read";
          best.key = o.key;
          best.failures = 0;
        } else if (best.kind === "unread") {
          best.failures++;
        }
        assigned.push(best);
      } else {
        const t: Track = {
          id: this.nextId++,
          kind: o.key ? "read" : "unread",
          format: o.format,
          box,
          key: o.key,
          lastSeen: now,
          failures: 0,
        };
        this.tracks.push(t);
        assigned.push(t);
      }
    }
    const lost = this.tracks.filter((t) => now - t.lastSeen > this.lostAfterMs);
    if (lost.length) this.tracks = this.tracks.filter((t) => !lost.includes(t));
    return { assigned, lost };
  }

  /** Tracks `unread` que ya fallaron ≥ 2 veces (candidatos a escalar), más recientes primero. */
  escalations(): Track[] {
    return this.tracks
      .filter((t) => t.kind === "unread" && t.failures >= 2)
      .sort((a, b) => b.lastSeen - a.lastSeen);
  }

  all(): readonly Track[] {
    return this.tracks;
  }

  reset(): void {
    this.tracks = [];
  }
}
