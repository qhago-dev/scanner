import { describe, expect, it } from "vitest";
import { encodeOptions, OPT_COUNT, Opt } from "../../src/engine/options";
import { DEFAULT_FORMATS, FORMATS, formatsMask } from "../../src/formats";

describe("encodeOptions", () => {
  it("usa los formatos por defecto de ADR-05 y balanced", () => {
    const a = encodeOptions({});
    expect(a.length).toBe(OPT_COUNT);
    expect(a[Opt.formats]).toBe(formatsMask(DEFAULT_FORMATS));
    expect(a[Opt.strategy]).toBe(1);
    expect(a[Opt.tryHarder]).toBe(-1);
    expect(a[Opt.preprocess]).toBe(-1);
    expect(a[Opt.regionW]).toBe(0);
  });

  it("codifica región, estrategia, strict y avanzadas", () => {
    const a = encodeOptions({
      strategy: "thorough",
      validateChecksums: "strict",
      region: { x: 10.4, y: 20, width: 100, height: 50 },
      maxSymbols: 999,
      returnErrors: true,
      advanced: {
        tryHarder: false,
        binarizer: "bool-cast",
        eanAddOn: "require",
        preprocess: { clahe: true, crops: true },
      },
    });
    expect([a[Opt.regionX], a[Opt.regionY], a[Opt.regionW], a[Opt.regionH]]).toEqual([
      10, 20, 100, 50,
    ]);
    expect(a[Opt.strategy]).toBe(2);
    expect(a[Opt.validateOptional]).toBe(1);
    expect(a[Opt.maxSymbols]).toBe(255);
    expect(a[Opt.returnErrors]).toBe(1);
    expect(a[Opt.tryHarder]).toBe(0);
    expect(a[Opt.binarizer]).toBe(3);
    expect(a[Opt.eanAddOn]).toBe(2);
    expect(a[Opt.preprocess]).toBe(1 | 8);
  });

  it("bitmask con el mismo orden que el motor", () => {
    expect(formatsMask(["aztec"])).toBe(1);
    expect(formatsMask(["upc_e"])).toBe(1 << 12);
    expect(formatsMask(FORMATS)).toBe((1 << 13) - 1);
  });
});
