import type { Point } from "./types";

export type ObjectFit = "cover" | "contain" | "fill" | "none" | "scale-down";

/** Transformación pura: puntos en píxeles del vídeo → píxeles CSS del elemento. */
export function mapPoints(
  points: readonly Point[],
  src: { width: number; height: number },
  box: { width: number; height: number },
  fit: ObjectFit = "contain",
  position: { x: number; y: number } = { x: 0.5, y: 0.5 },
  mirrored = false,
): Point[] {
  let sx = box.width / src.width;
  let sy = box.height / src.height;
  if (fit === "cover") sx = sy = Math.max(sx, sy);
  else if (fit === "contain") sx = sy = Math.min(sx, sy);
  else if (fit === "none") sx = sy = 1;
  else if (fit === "scale-down") sx = sy = Math.min(1, Math.min(sx, sy));
  const ox = (box.width - src.width * sx) * position.x;
  const oy = (box.height - src.height * sy) * position.y;
  return points.map((p) => {
    const x = ox + p.x * sx;
    return { x: mirrored ? box.width - x : x, y: oy + p.y * sy };
  });
}

function parsePosition(v: string): { x: number; y: number } {
  const words: Record<string, number> = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 };
  const parts = v.trim().split(/\s+/);
  const one = (s: string | undefined) =>
    s === undefined ? 0.5 : s.endsWith("%") ? Number.parseFloat(s) / 100 : (words[s] ?? 0.5);
  if (parts[0] === "top" || parts[0] === "bottom") return { x: one(parts[1]), y: one(parts[0]) };
  return { x: one(parts[0]), y: one(parts[1]) };
}

/**
 * Convierte puntos del frame de vídeo (los de BarcodeResult/TrackedResult) a coordenadas CSS del
 * elemento mostrado, respetando object-fit, object-position y el espejado de la cámara frontal
 * (`mirrored`, o `transform: scaleX(-1)` en el elemento).
 */
export function mapToElement(
  points: readonly Point[],
  el: HTMLVideoElement,
  opts: { mirrored?: boolean } = {},
): Point[] {
  const cs = getComputedStyle(el);
  const mirrored = opts.mirrored ?? /matrix\(-1|scaleX\(-1\)/.test(cs.transform);
  return mapPoints(
    points,
    { width: el.videoWidth || 1, height: el.videoHeight || 1 },
    { width: el.clientWidth, height: el.clientHeight },
    (cs.objectFit as ObjectFit) || "contain",
    parsePosition(cs.objectPosition || "50% 50%"),
    mirrored,
  );
}
