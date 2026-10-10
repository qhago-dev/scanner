import type { Engine, Raster } from "./engine/engine";
import { encodeOptions } from "./engine/options";
import { ScanError, throwIfAborted } from "./errors";
import { isBarcodeFormat } from "./formats";
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
  checkPixels(raster.width, raster.height, options.maxInputPixels ?? 16e6);
  throwIfAborted(options.signal);
  let out: ReturnType<Engine["read"]>;
  try {
    out = engine.read(
      raster,
      encodeOptions({ ...options, returnErrors: options.includeErrors === true }),
    );
  } catch (e) {
    throw new ScanError(
      "INVALID_INPUT",
      `El motor rechazó la imagen: ${String((e as Error).message ?? e)}`,
      { cause: e },
    );
  }
  const results = out.results.filter((r) => passesValidation(r, options.validateChecksums));
  return options.includeErrors ? { results, candidates: out.candidates } : results;
}
