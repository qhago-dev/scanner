// Sesión de escaneo de vídeo (F3): corre en el worker o, como fallback, en el hilo principal.
import { type Platform, readRaster } from "../core";
import type { Engine, Raster } from "../engine/engine";
import { isScanError, ScanError } from "../errors";
import type { ImageInput } from "../input/common";
import type { BarcodeResult, Point, Rect } from "../types";
import { contentKey, Fusion } from "./fusion";
import { type Observation, type Track, Tracker } from "./tracker";
import type { ScannerEvent, ScannerWorkerOptions, TrackedResult } from "./types";

/** Eventos que cruzan del worker al hilo principal (ScanError se serializa aparte). */
export type WireEvent =
  | Exclude<ScannerEvent, { type: "error" } | { type: "state" }>
  | { type: "error"; code: ScanError["code"]; message: string };

export interface FrameMeta {
  ts: number;
  /** Tamaño del vídeo original (las coordenadas emitidas están en este espacio). */
  srcWidth: number;
  srcHeight: number;
}

const SWEEP_ZONES: Rect[] = [
  { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
  { x: 0, y: 0, width: 0.6, height: 0.6 },
  { x: 0.4, y: 0, width: 0.6, height: 0.6 },
  { x: 0, y: 0.4, width: 0.6, height: 0.6 },
  { x: 0.4, y: 0.4, width: 0.6, height: 0.6 },
];

function scalePoint(p: Point, sx: number, sy: number): Point {
  return { x: p.x * sx, y: p.y * sy };
}

export class ScannerSession {
  private tracker: Tracker;
  private fusion: Fusion;
  private emptyFrames = 0;
  private sweepIndex = 0;
  private reported = new Set<number>();

  constructor(
    private opts: ScannerWorkerOptions,
    private readonly platform: Platform,
    private readonly emit: (e: WireEvent) => void,
  ) {
    this.tracker = new Tracker(opts.lostAfterMs);
    this.fusion = new Fusion(opts.fusion);
  }

  configure(next: Partial<ScannerWorkerOptions>): void {
    this.opts = { ...this.opts, ...next };
    this.fusion.setOptions(this.opts.fusion);
  }

  /** Cambio de dimensiones/rotación del stream: el tracking anterior ya no es válido. */
  resetTracking(): void {
    this.tracker.reset();
    this.fusion.reset();
    this.reported.clear();
    this.emptyFrames = 0;
  }

  async process(input: ImageInput, meta: FrameMeta): Promise<{ ms: number; passes: string[] }> {
    const t0 = performance.now();
    let engine: Engine;
    let raster: Raster;
    try {
      engine = await this.platform.loadEngine();
      raster = await this.platform.toRaster(input, engine);
    } catch (e) {
      this.emitError(e);
      return { ms: performance.now() - t0, passes: [] };
    }
    // Factor del frame procesado al vídeo original (ruta 2 llega reducido).
    const sx = meta.srcWidth / raster.width;
    const sy = meta.srcHeight / raster.height;
    const roi = this.roiPx(raster);
    const base = {
      formats: this.opts.formats,
      strategy: this.opts.strategy,
      maxSymbols: this.opts.maxCodes,
      validateChecksums: this.opts.validateChecksums,
      returnErrors: true,
    };
    const passes: string[] = [];
    const read = (region: Rect, strategy = this.opts.strategy) => {
      const r = readRaster(engine, raster, { ...base, strategy, region });
      passes.push(
        ...r.passes.map((p) => (strategy === this.opts.strategy ? p : `${strategy}:${p}`)),
      );
      return r;
    };

    let frame: ReturnType<typeof read>;
    try {
      frame = read(roi);
    } catch (e) {
      this.emitError(e);
      return { ms: performance.now() - t0, passes };
    }
    const now = meta.ts;
    const obs: Observation[] = [
      ...frame.results.map((r) => ({
        format: r.format,
        corners: r.cornerPoints,
        key: contentKey(r.format, r.bytes),
      })),
      ...frame.candidates.map((c) => ({ format: c.format, corners: c.cornerPoints, key: null })),
    ];
    const { assigned, lost } = this.tracker.update(obs, now);
    frame.results.forEach((r, i) => {
      const t = assigned[i];
      if (t) this.vote(t, r, now, sx, sy);
    });

    // Escalado: un track unread que ya falló 2 veces → thorough en su ROI expandida (máx. 1 por frame).
    const esc = this.tracker.escalations()[0];
    if (esc) {
      const r = this.safeRead(read, this.expand(esc.box, raster, 0.2), "thorough");
      const hit = r?.results.find((x) => x.format === esc.format) ?? r?.results[0];
      if (hit) {
        esc.kind = "read";
        esc.failures = 0;
        esc.key = contentKey(hit.format, hit.bytes);
        this.vote(esc, hit, now, sx, sy);
      }
    }

    // Barrido rotativo cuando no hay nada (ni lecturas ni símbolos sin leer).
    const nothing = frame.results.length === 0 && frame.candidates.length === 0;
    this.emptyFrames = nothing ? this.emptyFrames + 1 : 0;
    if (nothing && this.emptyFrames >= this.opts.escalateAfterFrames) {
      const zone = SWEEP_ZONES[this.sweepIndex++ % SWEEP_ZONES.length] as Rect;
      const region = this.intersect(this.toPx(zone, raster), roi);
      const r = region && this.safeRead(read, region, "thorough");
      if (r?.results.length) {
        const a = this.tracker.update(
          r.results.map((x) => ({
            format: x.format,
            corners: x.cornerPoints,
            key: contentKey(x.format, x.bytes),
          })),
          now,
        ).assigned;
        r.results.forEach((x, i) => {
          const t = a[i];
          if (t) this.vote(t, x, now, sx, sy);
        });
      }
    }

    for (const t of lost) {
      this.fusion.forget(t.id);
      if (this.reported.delete(t.id)) this.emit({ type: "lost", trackId: t.id });
    }
    return { ms: performance.now() - t0, passes };
  }

  private vote(t: Track, r: BarcodeResult, now: number, sx: number, sy: number): void {
    const d = this.fusion.observe(t.id, contentKey(r.format, r.bytes), r.format, r.text, now);
    const c = r.cornerPoints.map((p) => scalePoint(p, sx, sy)) as [Point, Point, Point, Point];
    const b = r.boundingBox;
    const result: TrackedResult = {
      ...r,
      cornerPoints: c,
      boundingBox: { x: b.x * sx, y: b.y * sy, width: b.width * sx, height: b.height * sy },
      trackId: t.id,
      votes: d.kind === "duplicate" ? 0 : d.votes,
      firstSeen: d.kind === "duplicate" ? now : d.firstSeen,
      lastSeen: now,
      // La confianza sube con el consenso multi-frame.
      confidence:
        d.kind === "duplicate" ? r.confidence : Math.min(1, r.confidence + 0.15 * (d.votes - 1)),
    };
    this.reported.add(t.id);
    this.emit({ type: d.kind === "duplicate" ? "track" : d.kind, result });
  }

  private safeRead<T>(read: (r: Rect, s: "thorough") => T, region: Rect, s: "thorough"): T | null {
    try {
      return read(region, s);
    } catch {
      return null;
    }
  }

  private roiPx(r: Raster): Rect {
    if (this.opts.roi === "full") return { x: 0, y: 0, width: r.width, height: r.height };
    return this.toPx(this.opts.roi, r);
  }

  private toPx(n: Rect, r: Raster): Rect {
    const x = Math.max(0, Math.round(n.x * r.width));
    const y = Math.max(0, Math.round(n.y * r.height));
    return {
      x,
      y,
      width: Math.max(1, Math.min(r.width - x, Math.round(n.width * r.width))),
      height: Math.max(1, Math.min(r.height - y, Math.round(n.height * r.height))),
    };
  }

  private expand(b: Rect, r: Raster, k: number): Rect {
    const x = Math.max(0, Math.floor(b.x - b.width * k));
    const y = Math.max(0, Math.floor(b.y - b.height * k));
    return {
      x,
      y,
      width: Math.min(r.width - x, Math.ceil(b.width * (1 + 2 * k))),
      height: Math.min(r.height - y, Math.ceil(b.height * (1 + 2 * k))),
    };
  }

  private intersect(a: Rect, b: Rect): Rect | null {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const w = Math.min(a.x + a.width, b.x + b.width) - x;
    const h = Math.min(a.y + a.height, b.y + b.height) - y;
    return w > 8 && h > 8 ? { x, y, width: w, height: h } : null;
  }

  private emitError(e: unknown): void {
    const err = isScanError(e) ? e : new ScanError("INVALID_INPUT", String(e));
    this.emit({ type: "error", code: err.code, message: err.message });
  }
}
