// Dibuja las esquinas de los códigos sobre el <video> (respeta object-fit: cover con mapToElement).
import { mapToElement, type Point, type TrackedResult } from "@qhago/scanner";

interface Shape {
  points: Point[];
  kind: "detect" | "candidate";
  at: number;
}

/** Tiempo que se mantiene una forma sin actualizaciones (por si no llega "lost"). */
const TTL_MS = 800;

export class Overlay {
  readonly #shapes = new Map<number, Shape>();
  readonly #ctx: CanvasRenderingContext2D;
  #raf = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly video: HTMLVideoElement,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d no disponible");
    this.#ctx = ctx;
  }

  update(result: TrackedResult, kind: Shape["kind"]): void {
    // Una candidata no tapa a un código ya confirmado.
    if (kind === "candidate" && this.#shapes.get(result.trackId)?.kind === "detect") return;
    this.#shapes.set(result.trackId, { points: result.cornerPoints, kind, at: performance.now() });
  }

  remove(trackId: number): void {
    this.#shapes.delete(trackId);
  }

  start(): void {
    if (this.#raf) return;
    const tick = () => {
      this.#draw();
      this.#raf = requestAnimationFrame(tick);
    };
    this.#raf = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    this.#shapes.clear();
    this.#draw();
  }

  #draw(): void {
    const { canvas, video } = this;
    const dpr = devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = this.#ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    if (!video.videoWidth) return;
    const now = performance.now();
    for (const [id, s] of this.#shapes) {
      if (now - s.at > TTL_MS) {
        this.#shapes.delete(id);
        continue;
      }
      const pts = mapToElement(s.points, video);
      ctx.beginPath();
      for (const [i, p] of pts.entries()) {
        if (i) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.lineWidth = s.kind === "detect" ? 4 : 2;
      ctx.strokeStyle = s.kind === "detect" ? "#22c55e" : "rgba(255,255,255,0.7)";
      ctx.fillStyle = s.kind === "detect" ? "rgba(34,197,94,0.18)" : "transparent";
      ctx.fill();
      ctx.stroke();
    }
  }
}
