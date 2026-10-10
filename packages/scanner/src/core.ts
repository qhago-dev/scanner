import type { Engine, Raster } from "./engine/engine";
import { encodeOptions } from "./engine/options";
import { ScanError, throwIfAborted } from "./errors";
import { DEFAULT_FORMATS, isBarcodeFormat } from "./formats";
import { normalizeUpc } from "./gtin";
import { checkPixels, type ImageInput } from "./input/common";
import type { BarcodeResult, DecodeOptions, DecodeWithErrors } from "./types";
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
  options: DecodeAllOptions & { returnErrors?: boolean },
) {
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
  const results = out.results
    .filter((r) => passesValidation(r, options.validateChecksums))
    .map((r) => normalizeUpc(r, requested));
  return { results, candidates: out.candidates, passes: out.passes, ms: out.ms };
}

/** decode() en el hilo actual. */
export async function decodeInline(
  p: Platform,
  input: ImageInput,
  options: DecodeAllOptions = {},
): Promise<BarcodeResult[] | DecodeWithErrors> {
  checkOptions(options);
  throwIfAborted(options.signal);
  const engine = await p.loadEngine();
  const raster = await p.toRaster(input, engine);
  throwIfAborted(options.signal);
  const { results, candidates } = readRaster(engine, raster, options);
  return options.includeErrors ? { results, candidates } : results;
}
