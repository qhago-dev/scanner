import { DEFAULT_FORMATS, formatsMask } from "../formats";
import type { DecodeOptions, DecodeStrategy } from "../types";

/** Índices del array int32 de opciones; deben coincidir con `Opt` en packages/engine-wasm/src/qhago_engine.h. */
export const Opt = {
  formats: 0,
  strategy: 1,
  tryHarder: 2,
  tryRotate: 3,
  tryInvert: 4,
  tryDownscale: 5,
  binarizer: 6,
  isPure: 7,
  eanAddOn: 8,
  maxSymbols: 9,
  minLineCount: 10,
  returnErrors: 11,
  validateOptional: 12,
  timeBudgetMs: 13,
  regionX: 14,
  regionY: 15,
  regionW: 16,
  regionH: 17,
  preprocess: 18,
  maxSide: 19,
  textMode: 20,
} as const;
export const OPT_COUNT = 21;

const STRATEGY: Record<DecodeStrategy, number> = { fast: 0, balanced: 1, thorough: 2 };
const BINARIZER = {
  "local-average": 0,
  "global-histogram": 1,
  "fixed-threshold": 2,
  "bool-cast": 3,
} as const;
const EAN_ADDON = { ignore: 0, read: 1, require: 2 } as const;
const TEXT_MODE = { plain: 0, hri: 1, escaped: 2, eci: 3 } as const;

const tri = (v: boolean | undefined) => (v === undefined ? -1 : v ? 1 : 0);

export interface EngineCallOptions extends DecodeOptions {
  /** Interno: pedir también candidatos fallidos (tracker de F3 / includeErrors). */
  returnErrors?: boolean;
}

export function encodeOptions(o: EngineCallOptions): Int32Array {
  const a = new Int32Array(OPT_COUNT);
  const adv = o.advanced ?? {};
  a[Opt.formats] = formatsMask(o.formats ?? DEFAULT_FORMATS);
  a[Opt.strategy] = STRATEGY[o.strategy ?? "balanced"];
  a[Opt.tryHarder] = tri(adv.tryHarder);
  a[Opt.tryRotate] = tri(adv.tryRotate);
  a[Opt.tryInvert] = tri(adv.tryInvert);
  a[Opt.tryDownscale] = tri(adv.tryDownscale);
  a[Opt.binarizer] = adv.binarizer ? BINARIZER[adv.binarizer] : -1;
  a[Opt.isPure] = adv.isPure ? 1 : 0;
  a[Opt.eanAddOn] = EAN_ADDON[adv.eanAddOn ?? "ignore"];
  a[Opt.maxSymbols] = Math.max(0, Math.min(255, o.maxSymbols ?? 0));
  a[Opt.minLineCount] = Math.max(0, Math.min(255, adv.minLineCount ?? 0));
  a[Opt.returnErrors] = o.returnErrors ? 1 : 0;
  a[Opt.validateOptional] = o.validateChecksums === "strict" ? 1 : 0;
  a[Opt.timeBudgetMs] = Math.max(0, Math.round(o.timeBudgetMs ?? 0));
  if (o.region) {
    a[Opt.regionX] = Math.round(o.region.x);
    a[Opt.regionY] = Math.round(o.region.y);
    a[Opt.regionW] = Math.round(o.region.width);
    a[Opt.regionH] = Math.round(o.region.height);
  }
  if (adv.preprocess) {
    const p = adv.preprocess;
    a[Opt.preprocess] =
      (p.clahe ? 1 : 0) | (p.unsharp ? 2 : 0) | (p.multiscale ? 4 : 0) | (p.crops ? 8 : 0);
  } else {
    a[Opt.preprocess] = -1;
  }
  a[Opt.maxSide] = 2560;
  a[Opt.textMode] = TEXT_MODE[adv.textMode ?? "plain"];
  return a;
}
