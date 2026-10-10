// Interfaz de plugins del worker (F5.6). Un plugin propone cuadriláteros donde puede haber un código; el motor
// los rectifica (sa_read_quad) y los lee. Los descriptores (ScannerPluginDescriptor) cruzan desde el main thread;
// las implementaciones viven en el worker que los registra con startWorkerHost({ plugins }).
import { readRaster } from "./core";
import type { Engine, EngineOutput, Raster } from "./engine/engine";
import { encodeOptions } from "./engine/options";
import { ScanError } from "./errors";
import { DEFAULT_FORMATS, isLinear } from "./formats";
import { normalizeUpc } from "./gtin";
import type {
  BarcodeFormat,
  BarcodeResult,
  DecodeOptions,
  Point,
  ScannerPluginDescriptor,
} from "./types";
import { passesValidation } from "./validate";

export const PLUGIN_API_VERSION = 1;

export type PluginRaster = Readonly<Raster>;

export interface PluginProposal {
  /** TL, TR, BR, BL en píxeles del raster (cualquier orden cíclico; el motor prueba rotaciones). */
  quad: readonly [Point, Point, Point, Point];
  /** Formatos probables (p. ej. por la clase del detector). Se intersecan con los configurados. */
  formats?: readonly BarcodeFormat[];
  score: number;
}

export interface PluginFrameContext {
  /** Frames seguidos sin lectura en esta sesión (0 en decode()). */
  framesWithoutRead: number;
  /** "image" en decode(), "video" en createScanner(). */
  source: "image" | "video";
}

export interface ScannerPlugin {
  readonly name: string;
  /** "fallback" (default): solo cuando el motor clásico no lee; "always": en cada frame. */
  readonly when?: "fallback" | "always";
  onFrame(raster: PluginRaster, ctx: PluginFrameContext): Promise<PluginProposal[]>;
  dispose?(): void;
}

export type PluginOptions = NonNullable<ScannerPluginDescriptor["options"]>;
export type ScannerPluginFactory = (
  options: PluginOptions,
) => ScannerPlugin | Promise<ScannerPlugin>;

/** Instancias por worker: un plugin (p. ej. un modelo ONNX) se inicializa una vez por (nombre, opciones). */
export class PluginRegistry {
  private instances = new Map<string, Promise<ScannerPlugin>>();
  constructor(private readonly factories: Record<string, ScannerPluginFactory> = {}) {}

  names(): string[] {
    return Object.keys(this.factories);
  }

  resolve(descriptors: readonly ScannerPluginDescriptor[] | undefined): Promise<ScannerPlugin>[] {
    return (descriptors ?? []).map((d) => {
      const factory = this.factories[d.name];
      if (!factory || d.apiVersion !== PLUGIN_API_VERSION)
        return Promise.reject(
          new ScanError(
            "UNSUPPORTED",
            factory
              ? `El plugin "${d.name}" pide la API de plugins v${d.apiVersion}; este worker implementa la v${PLUGIN_API_VERSION}.`
              : `Este worker no tiene el plugin "${d.name}".`,
          ),
        );
      const key = `${d.name}:${JSON.stringify(d.options ?? {})}`;
      let p = this.instances.get(key);
      if (!p) {
        p = Promise.resolve(factory(d.options ?? {}));
        // Si falla la inicialización, se reintenta en la próxima llamada.
        p.catch(() => this.instances.delete(key));
        this.instances.set(key, p);
      }
      return p;
    });
  }
}

/** Mensaje accionable cuando se piden plugins sin un worker que los registre. */
export function missingPluginError(missing: string[]): ScanError {
  return new ScanError(
    "UNSUPPORTED",
    `Plugins no disponibles en este worker: ${missing.join(", ")}. Pasa el worker del paquete del plugin, ` +
      "p. ej. createScanner({ workerFactory: aiWorker, plugins: [aiDetector()] }) de @qhago/ai.",
  );
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Expande el cuadrilátero desde su centro (zona de silencio) y calcula un tamaño destino razonable. */
export function rectifyTarget(
  quad: readonly Point[],
  linear: boolean,
): { quad: [Point, Point, Point, Point]; width: number; height: number } {
  const c = quad.reduce((s, p) => ({ x: s.x + p.x / 4, y: s.y + p.y / 4 }), { x: 0, y: 0 });
  const k = linear ? 1.25 : 1.2;
  const q = quad.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k })) as [
    Point,
    Point,
    Point,
    Point,
  ];
  const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
  const h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  const long = Math.max(w, h, 1);
  // Lado largo = máx(lado medido, 256), con techo para no inflar crops enormes.
  const s = Math.min(1600, Math.max(long, 256)) / long;
  return {
    quad: q,
    width: Math.max(16, Math.round(w * s)),
    height: Math.max(16, Math.round(h * s)),
  };
}

function readOne(
  engine: Engine,
  raster: Raster,
  p: PluginProposal,
  o: DecodeOptions,
  formats: readonly BarcodeFormat[],
): EngineOutput {
  const linear = formats.every(isLinear);
  const t = rectifyTarget(p.quad, linear);
  return engine.readQuad(
    raster,
    t.quad,
    t.width,
    t.height,
    encodeOptions({ ...o, formats, region: undefined, strategy: "balanced" }),
  );
}

/** Lee las propuestas de un plugin: primero con los formatos sugeridos, luego con todos los configurados. */
export function readProposals(
  engine: Engine,
  raster: Raster,
  proposals: readonly PluginProposal[],
  o: DecodeOptions,
  maxObjects = 5,
): BarcodeResult[] {
  const requested = o.formats ?? DEFAULT_FORMATS;
  const out: BarcodeResult[] = [];
  const seen = new Set<string>();
  for (const p of [...proposals].sort((a, b) => b.score - a.score).slice(0, maxObjects)) {
    const hinted = p.formats?.filter((f) => requested.includes(f)) ?? [];
    let r = hinted.length ? readOne(engine, raster, p, o, hinted) : null;
    if (!r?.results.length) r = readOne(engine, raster, p, o, requested);
    for (const x of r.results) {
      if (!passesValidation(x, o.validateChecksums)) continue;
      const res = normalizeUpc(
        { ...x, confidence: x.confidence * Math.min(1, 0.5 + p.score) },
        requested,
      );
      const key = `${res.format}:${res.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(res);
    }
  }
  return out;
}

/** decode() con plugins: si la cascada no lee, cada plugin propone regiones. */
export async function decodeWithPlugins(
  engine: Engine,
  raster: Raster,
  plugins: Promise<ScannerPlugin>[],
  o: DecodeOptions & { includeErrors?: boolean },
): Promise<ReturnType<typeof readRaster>> {
  const base = readRaster(engine, raster, o);
  for (const pp of plugins) {
    const plugin = await pp;
    if (base.results.length && plugin.when !== "always") continue;
    const props = await plugin.onFrame(raster, { framesWithoutRead: 0, source: "image" });
    const extra = readProposals(engine, raster, props, o).filter(
      (x) => !base.results.some((b) => b.format === x.format && b.text === x.text),
    );
    base.results.push(...extra);
    if (extra.length) base.passes.push(`plugin:${plugin.name}`);
  }
  return base;
}
