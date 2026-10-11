// Sesión de escaneo de vídeo (F3): corre en el worker o, como fallback, en el hilo principal.
import { type Platform, readRaster } from "../core";
import type { Engine, Raster } from "../engine/engine";
import { isScanError, ScanError } from "../errors";
import type { ImageInput } from "../input/common";
import {
  missingPluginError,
  type PluginRegistry,
  readProposals,
  type ScannerPlugin,
} from "../plugins";
import type { AdvancedDecodeOptions, BarcodeResult, Point, Rect } from "../types";
import { contentKey, Fusion } from "./fusion";
import { type Observation, type Track, Tracker } from "./tracker";
import type { ScannerEvent, ScannerWorkerOptions, TrackedResult } from "./types";

type AdvancedOptions = Partial<AdvancedDecodeOptions>;

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
/**
 * El barrido "thorough" completo de una zona cuesta ~25-50× un frame "fast" (~650 ms en un Android de
 * gama media) y bloquea el motor justo cuando el código entra en cuadro. Se reparte en rebanadas: cada
 * frame vacío ejecuta una sola (zona × preproceso), dando más turnos al preproceso barato y
 * más útil. Mismo trabajo total, sin fotogramas de 650 ms.
 */
const SWEEP_SLICES: AdvancedOptions[] = [
  { preprocess: { clahe: true } }, // fast + harder + inverted + CLAHE: baratas y las que más rescatan
  { preprocess: { unsharp: true, crops: true }, tryInvert: false },
  { preprocess: { multiscale: true }, tryInvert: false }, // x2 / x0.5: la cara (~80 % del coste)
];
/** Orden de rebanadas: la barata en la mitad de los frames. 4 y 5 zonas son coprimos → 20 frames cubren todo. */
const SWEEP_PATTERN = [0, 1, 0, 2] as const;
/**
 * Fracción máxima del tiempo de pared para el barrido: tras una rebanada de c ms se espera
 * c·(1/SWEEP_DUTY − 1) ms antes de la siguiente (solo frena las rebanadas caras en equipos lentos).
 */
export const SWEEP_DUTY = 0.5;
/**
 * La rebanada multiescala (la cara: ~500 ms en un Android de gama media, ~50 ms en escritorio) tiene su
 * propio límite: como mucho el 10 % del tiempo. Si aún no toca, se ejecuta la barata en su lugar.
 */
export const HEAVY_DUTY = 0.1;
const HEAVY = 2;

function scalePoint(p: Point, sx: number, sy: number): Point {
  return { x: p.x * sx, y: p.y * sy };
}

export class ScannerSession {
  private tracker: Tracker;
  private fusion: Fusion;
  private emptyFrames = 0;
  private sweepIndex = 0;
  /** Momento (ts del frame) a partir del cual se permite el siguiente barrido. */
  private nextSweepAt = -Infinity;
  private nextHeavyAt = -Infinity;
  private reported = new Set<number>();
  private framesWithoutRead = 0;
  private plugins: Promise<ScannerPlugin[]> | null = null;
  private pluginError = false;

  constructor(
    private opts: ScannerWorkerOptions,
    private readonly platform: Platform,
    private readonly emit: (e: WireEvent) => void,
    private readonly registry?: PluginRegistry,
  ) {
    this.tracker = new Tracker(opts.lostAfterMs);
    this.fusion = new Fusion(opts.fusion);
  }

  configure(next: Partial<ScannerWorkerOptions>): void {
    this.opts = { ...this.opts, ...next };
    this.fusion.setOptions(this.opts.fusion);
    if ("plugins" in next) this.plugins = null;
  }

  /** Plugins resueltos (una vez); si falta alguno o falla su inicialización se emite un error y se ignoran. */
  private loadPlugins(): Promise<ScannerPlugin[]> {
    const wanted = this.opts.plugins ?? [];
    this.plugins ??= (async () => {
      if (!wanted.length) return [];
      const missing = wanted.map((d) => d.name).filter((n) => !this.registry?.names().includes(n));
      if (missing.length) throw missingPluginError(missing);
      return Promise.all((this.registry as PluginRegistry).resolve(wanted));
    })().catch((e) => {
      if (!this.pluginError) this.emitError(e);
      this.pluginError = true;
      return [];
    });
    return this.plugins;
  }

  /** Cambio de dimensiones/rotación del stream: el tracking anterior ya no es válido. */
  resetTracking(): void {
    this.tracker.reset();
    this.fusion.reset();
    this.reported.clear();
    this.emptyFrames = 0;
    this.nextSweepAt = -Infinity;
    this.nextHeavyAt = -Infinity;
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
    const read = (region: Rect, strategy = this.opts.strategy, advanced?: AdvancedOptions) => {
      const r = readRaster(engine, raster, { ...base, strategy, region, advanced });
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
    let readAny = frame.results.length > 0;
    const esc = this.tracker.escalations()[0];
    if (esc) {
      const r = this.safeRead(read, this.expand(esc.box, raster, 0.2), "thorough");
      const hit = r?.results.find((x) => x.format === esc.format) ?? r?.results[0];
      if (hit) {
        esc.kind = "read";
        esc.failures = 0;
        esc.key = contentKey(hit.format, hit.bytes);
        this.vote(esc, hit, now, sx, sy, true);
        readAny = true;
      }
    }

    // Barrido rotativo cuando no hay nada (ni lecturas ni símbolos sin leer).
    const nothing = frame.results.length === 0 && frame.candidates.length === 0;
    this.emptyFrames = nothing ? this.emptyFrames + 1 : 0;
    if (nothing && this.emptyFrames >= this.opts.escalateAfterFrames && now >= this.nextSweepAt) {
      const i = this.sweepIndex++;
      const zone = SWEEP_ZONES[i % SWEEP_ZONES.length] as Rect;
      let k = SWEEP_PATTERN[i % SWEEP_PATTERN.length] as number;
      if (k === HEAVY && now < this.nextHeavyAt) k = 0;
      const slice = SWEEP_SLICES[k];
      const region = this.intersect(this.toPx(zone, raster), roi);
      const ts0 = performance.now();
      const r = region && this.safeRead(read, region, "thorough", slice);
      const cost = performance.now() - ts0;
      this.nextSweepAt = now + cost * (1 / SWEEP_DUTY - 1);
      if (k === HEAVY) this.nextHeavyAt = now + cost * (1 / HEAVY_DUTY - 1);
      if (r?.results.length) {
        this.trackAndVote(r.results, now, sx, sy, true);
        readAny = true;
      }
    }

    // Plugins (F5.6): en "fallback" solo tras escalateAfterFrames frames sin lectura.
    this.framesWithoutRead = readAny ? 0 : this.framesWithoutRead + 1;
    if (this.opts.plugins?.length) {
      for (const plugin of await this.loadPlugins()) {
        const due =
          plugin.when === "always" ||
          (!readAny && this.framesWithoutRead >= this.opts.escalateAfterFrames);
        if (!due) continue;
        try {
          const props = (
            await plugin.onFrame(raster, {
              framesWithoutRead: this.framesWithoutRead,
              source: "video",
            })
          ).filter((p) => {
            const c = p.quad.reduce((s, q) => ({ x: s.x + q.x / 4, y: s.y + q.y / 4 }), {
              x: 0,
              y: 0,
            });
            return (
              c.x >= roi.x && c.y >= roi.y && c.x <= roi.x + roi.width && c.y <= roi.y + roi.height
            );
          });
          const hits = readProposals(
            engine,
            raster,
            props,
            { ...base, maxSymbols: undefined },
            this.opts.maxCodes,
          );
          passes.push(`plugin:${plugin.name}`);
          if (hits.length) {
            this.trackAndVote(hits, now, sx, sy, true);
            this.framesWithoutRead = 0;
          }
        } catch (e) {
          this.emitError(e);
        }
      }
    }

    for (const t of lost) {
      this.fusion.forget(t.id);
      if (this.reported.delete(t.id)) this.emit({ type: "lost", trackId: t.id });
    }
    return { ms: performance.now() - t0, passes };
  }

  private trackAndVote(
    results: BarcodeResult[],
    now: number,
    sx: number,
    sy: number,
    weak = false,
  ): void {
    const a = this.tracker.update(
      results.map((x) => ({
        format: x.format,
        corners: x.cornerPoints,
        key: contentKey(x.format, x.bytes),
      })),
      now,
    ).assigned;
    results.forEach((x, i) => {
      const t = a[i];
      if (t) this.vote(t, x, now, sx, sy, weak);
    });
  }

  private vote(
    t: Track,
    r: BarcodeResult,
    now: number,
    sx: number,
    sy: number,
    weak = false,
  ): void {
    // Confianza < 1 (≤ 3 líneas de barrido de acuerdo): en fotos reales de envases arrugados todas las
    // lecturas EAN falsas, incluso de la pasada normal, tenían confianza 0,5-0,75 → también 2 frames.
    const d = this.fusion.observe(
      t.id,
      contentKey(r.format, r.bytes),
      r.format,
      r.text,
      now,
      weak || r.confidence < 1,
    );
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

  private safeRead<T>(
    read: (r: Rect, s: "thorough", a?: AdvancedOptions) => T,
    region: Rect,
    s: "thorough",
    advanced?: AdvancedOptions,
  ): T | null {
    try {
      return read(region, s, advanced);
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
