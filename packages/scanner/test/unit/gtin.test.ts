import { describe, expect, it } from "vitest";
import { normalizeUpc } from "../../src/gtin";
import type { BarcodeResult } from "../../src/types";

const r = (format: BarcodeResult["format"], text: string) =>
  ({ format, text, bytes: new Uint8Array() }) as BarcodeResult;

describe("normalizeUpc", () => {
  it("EAN-13 con 0 inicial → upc_a de 12 dígitos si se pidió upc_a", () => {
    expect(normalizeUpc(r("ean_13", "0036602301467"), ["ean_13", "upc_a"])).toMatchObject({
      format: "upc_a",
      text: "036602301467",
    });
    expect(normalizeUpc(r("upc_a", "0036602301467"), ["upc_a"]).text).toBe("036602301467");
  });
  it("sin upc_a pedido, o sin 0 inicial, no cambia", () => {
    expect(normalizeUpc(r("ean_13", "0036602301467"), ["ean_13"]).format).toBe("ean_13");
    expect(normalizeUpc(r("ean_13", "5901234123457"), ["ean_13", "upc_a"]).format).toBe("ean_13");
    expect(normalizeUpc(r("code_128", "0123456789012"), ["upc_a", "code_128"]).format).toBe(
      "code_128",
    );
  });
});
