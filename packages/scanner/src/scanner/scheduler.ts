/**
 * Back-pressure + ritmo adaptativo (F3): 1 frame en vuelo, intervalo ≈ 1,2 × mediana de los últimos 8 tiempos
 * de proceso, acotado entre 1/maxFps y 1/minFps. Mediana y no media: los frames de escalado o de IA son caros
 * a propósito y no deben frenar el ritmo normal.
 */
export class Scheduler {
  private inFlight = false;
  private last = -Infinity;
  private costs: number[] = [];
  private minInterval: number;

  constructor(
    private maxFps = 15,
    private readonly minFps = 4,
  ) {
    this.minInterval = 1000 / maxFps;
  }

  setMaxFps(fps: number): void {
    this.maxFps = Math.max(this.minFps, fps);
    this.minInterval = Math.max(this.minInterval, 1000 / this.maxFps);
  }

  canSend(now: number): boolean {
    return !this.inFlight && now - this.last >= this.minInterval;
  }

  sent(now: number): void {
    this.inFlight = true;
    this.last = now;
  }

  done(ms: number): void {
    this.inFlight = false;
    this.costs.push(ms);
    if (this.costs.length > 8) this.costs.shift();
    const sorted = [...this.costs].sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1] as number;
    this.minInterval = Math.min(1000 / this.minFps, Math.max(1000 / this.maxFps, med * 1.2));
  }

  /** Nueva sesión (stop/start, cambio de cámara): un frame en vuelo del worker anterior ya no volverá. */
  reset(): void {
    this.inFlight = false;
    this.last = Number.NEGATIVE_INFINITY;
  }

  get fps(): number {
    return 1000 / this.minInterval;
  }

  get busy(): boolean {
    return this.inFlight;
  }
}
