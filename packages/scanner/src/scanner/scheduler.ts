/** Back-pressure + ritmo adaptativo (F3): 1 frame en vuelo, intervalo ≈ 1,2 × EMA del tiempo de proceso. */
export class Scheduler {
  private inFlight = false;
  private last = -Infinity;
  private ema = 0;
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
    this.ema = this.ema ? 0.8 * this.ema + 0.2 * ms : ms;
    this.minInterval = Math.min(1000 / this.minFps, Math.max(1000 / this.maxFps, this.ema * 1.2));
  }

  get fps(): number {
    return 1000 / this.minInterval;
  }

  get busy(): boolean {
    return this.inFlight;
  }
}
