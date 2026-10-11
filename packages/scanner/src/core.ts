import { contradicts, dropConflicts, verifyHarder } from "./conflicts";
import { readBlurredEan } from "./deblur";
import { locate1D, type Region1D } from "./deblur/locate";
import type { Engine, Raster } from "./engine/engine";
import { encodeOptions } from "./engine/options";
import { ScanError, throwIfAborted } from "./errors";
import { DEFAULT_FORMATS, isBarcodeFormat } from "./formats";
import { normalizeUpc } from "./gtin";
import { checkPixels, type ImageInput } from "./input/common";
import { decodeWithPlugins, missingPluginError, type PluginRegistry } from "./plugins";
import type { BarcodeFormat, BarcodeResult, DecodeOptions, DecodeWithErrors } from "./types";
import { passesValidation } from "./validate";

export interface Platform {
  loadEngine(): Promise<Engine>;
  toRaster(input: ImageInput, engine: Engine): Promise<Raster>;
}

export type DecodeAllOptions = DecodeOptions & { includeErrors?: boolean };

export function checkOptions(o: DecodeAllOptions): void {
  for (const f of o.formats ?? []) {
    if (!isBarcodeFormat(f))
      throw new ScanError("INVALID_INPUT", `Formato desconocido: ${String(f)}`);
  }
  if (o.formats && o.formats.length === 0)
    throw new ScanError("INVALID_INPUT", "formats no puede estar vacío");
  if (o.strategy !== undefined && !["fast", "balanced", "thorough"].includes(o.strategy))
    throw new ScanError("INVALID_INPUT", `strategy desconocida: ${String(o.strategy)}`);
  const r = o.region;
  if (
    r &&
    !(
      [r.x, r.y, r.width, r.height].every(Number.isFinite) &&
      r.x >= 0 &&
      r.y >= 0 &&
      r.width > 0 &&
      r.height > 0
    )
  )
    throw new ScanError(
      "INVALID_INPUT",
      "region debe tener x, y ≥ 0 y width, height > 0 (píxeles)",
    );
  for (const k of ["maxSymbols", "timeBudgetMs", "maxInputPixels"] as const) {
    const v = o[k];
    if (v !== undefined && !(Number.isFinite(v) && v >= 0))
      throw new ScanError("INVALID_INPUT", `${k} debe ser un número ≥ 0`);
  }
}

/** Lee un raster ya preparado (compartido por decode() y la sesión de escaneo). */
export function readRaster(
  engine: Engine,
  raster: Raster,
  options: DecodeAllOptions & { returnErrors?: boolean; noVerify?: boolean },
): {
  results: BarcodeResult[];
  candidates: ReturnType<Engine["read"]>["candidates"];
  passes: string[];
  ms: number;
} {
  checkPixels(raster.width, raster.height, options.maxInputPixels ?? 16e6);
  let out: ReturnType<Engine["read"]>;
  try {
    out = engine.read(
      raster,
      encodeOptions({
        ...options,
        returnErrors: options.returnErrors ?? options.includeErrors === true,
      }),
    );
  } catch (e) {
    throw new ScanError(
      "INVALID_INPUT",
      `El motor rechazó la imagen: ${String((e as Error).message ?? e)}`,
      { cause: e },
    );
  }
  const requested = options.formats ?? DEFAULT_FORMATS;
  const ok = out.results.map((r) => passesValidation(r, options.validateChecksums));
  let results = out.results.filter((_, i) => ok[i]).map((r) => normalizeUpc(r, requested));
  if (!options.noVerify) {
    const passes = out.resultPasses.filter((_, i) => ok[i]);
    results = verifyHarder(results, passes, raster, (region) =>
      rereadNormal(engine, raster, region, requested, options.validateChecksums),
    );
  }
  results = dropConflicts(results);
  return { results, candidates: out.candidates, passes: out.passes, ms: out.ms };
}

/** Relectura sin "harder" (x1, x2, x0,5) de una región, solo EAN/UPC: base de `verifyHarder`. */
export function rereadNormal(
  engine: Engine,
  raster: Raster,
  region: { x: number; y: number; width: number; height: number },
  requested: readonly BarcodeFormat[],
  validateChecksums: DecodeOptions["validateChecksums"],
): BarcodeResult[] {
  return readRaster(engine, raster, {
    formats: requested.filter((f) => ["ean_13", "ean_8", "upc_a", "upc_e"].includes(f)),
    strategy: "thorough",
    region,
    validateChecksums,
    advanced: { tryHarder: false, tryInvert: false, preprocess: { multiscale: true } },
    noVerify: true,
  }).results;
}

/** decode() en el hilo actual. */
export async function decodeInline(
  p: Platform,
  input: ImageInput,
  options: DecodeAllOptions = {},
  registry?: PluginRegistry,
): Promise<BarcodeResult[] | DecodeWithErrors> {
  checkOptions(options);
  throwIfAborted(options.signal);
  const wanted = options.plugins ?? [];
  const missing = wanted.map((d) => d.name).filter((n) => !registry?.names().includes(n));
  if (missing.length) throw missingPluginError(missing);
  const engine = await p.loadEngine();
  const raster = await p.toRaster(input, engine);
  throwIfAborted(options.signal);
  const { results, candidates } = wanted.length
    ? await decodeWithPlugins(engine, raster, (registry as PluginRegistry).resolve(wanted), options)
    : readRaster(engine, raster, options);
  const checked = deblurCrossCheck(raster, results, options);
  checked.push(...deblurFallback(raster, checked, options));
  return options.includeErrors ? { results: checked, candidates } : checked;
}

const EAN_UPC_F: readonly BarcodeFormat[] = ["ean_13", "upc_a", "ean_8", "upc_e"];

/**
 * Fase 9 (M4): si la cascada no devolvió ningún EAN/UPC y se pidieron, el lector por deconvolución prueba los
 * códigos 1D desenfocados que ZXing no separa (barras de 1 módulo a ~1 módulo de desenfoque). Solo en
 * balanced/thorough: en fotos reales del Android sumó lecturas sin ninguna falsa.
 */
/**
 * Verificación cruzada (fotos): un EAN/UPC de la cascada con confianza < 1 (pocas líneas de acuerdo) se relee
 * con el lector por deconvolución en su zona; si este da otro número con sus umbrales, el de la cascada se
 * descarta y se devuelve el suyo. En fotos reales de un envase arrugado corrigió 3 de 4 lecturas falsas.
 */
export function deblurCrossCheck(
  raster: Raster,
  results: BarcodeResult[],
  options: DecodeOptions,
): BarcodeResult[] {
  if ((options.strategy ?? "balanced") === "fast") return results;
  const requested = options.formats ?? DEFAULT_FORMATS;
  const out: BarcodeResult[] = [];
  let located: Region1D[] | null = null;
  for (const r of results) {
    if (!EAN_UPC_F.includes(r.format) || r.confidence >= 1) {
      out.push(r);
      continue;
    }
    // La zona del quad suele ser una sola línea: se usan también las regiones localizadas sobre el resultado.
    located ??= locate1D(raster, 3);
    const b = r.boundingBox;
    const m = Math.max(b.width, b.height) / 2;
    const near = located.filter(
      (g) =>
        g.cx >= b.x - m &&
        g.cx <= b.x + b.width + m &&
        g.cy >= b.y - m &&
        g.cy <= b.y + b.height + m,
    );
    const alt = readBlurredEan(raster, { regions: [...near, regionOf(r)] }).map((x) =>
      normalizeUpc(x, requested),
    );
    const other = alt.find((x) => x.text.replace(/^0+/, "") !== r.text.replace(/^0+/, ""));
    out.push(other && requested.includes(other.format) ? other : r);
  }
  return out;
}

/** Región 1D a partir del quad de un resultado (eje largo = a través de las barras). */
function regionOf(r: BarcodeResult): Region1D {
  const [p0, p1, p2, p3] = r.cornerPoints;
  const cx = (p0.x + p1.x + p2.x + p3.x) / 4;
  const cy = (p0.y + p1.y + p2.y + p3.y) / 4;
  const top = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const side = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  const [dx, dy, len, thick] =
    top >= side ? [p1.x - p0.x, p1.y - p0.y, top, side] : [p3.x - p0.x, p3.y - p0.y, side, top];
  const ux = dx / (len || 1);
  const uy = dy / (len || 1);
  const hv = Math.max(thick / 2, 0.15 * len);
  return { cx, cy, ux, uy, u0: -len / 2, u1: len / 2, v0: -hv, v1: hv, score: 1 };
}

export function deblurFallback(
  raster: Raster,
  results: readonly BarcodeResult[],
  options: DecodeOptions,
): BarcodeResult[] {
  const requested = options.formats ?? DEFAULT_FORMATS;
  if ((options.strategy ?? "balanced") === "fast") return [];
  if (!requested.includes("ean_13") && !requested.includes("upc_a")) return [];
  if (results.some((r) => EAN_UPC_F.includes(r.format))) return [];
  const reg = options.region;
  const regions = locate1D(raster, 2).filter(
    (g) =>
      !reg ||
      (g.cx >= reg.x && g.cy >= reg.y && g.cx <= reg.x + reg.width && g.cy <= reg.y + reg.height),
  );
  return readBlurredEan(raster, { regions })
    .map((r) => normalizeUpc(r, requested))
    .filter((r) => requested.includes(r.format) && !results.some((b) => contradicts(b, r)));
}
