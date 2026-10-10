import { describe, expect, it } from "vitest";
import { confidenceOf } from "../../src/engine/engine";
import type { BarcodeResult } from "../../src/types";
import { passesValidation } from "../../src/validate";

const r = (format: BarcodeResult["format"], text: string) => ({ format, text }) as BarcodeResult;

describe("passesValidation", () => {
  it("ITF exige longitud par ≥ 6", () => {
    expect(passesValidation(r("itf", "123456"))).toBe(true);
    expect(passesValidation(r("itf", "12345"))).toBe(false);
    expect(passesValidation(r("itf", "1234"))).toBe(false);
    expect(passesValidation(r("itf", "1234"), false)).toBe(true);
  });
  it("Codabar exige ≥ 3 caracteres", () => {
    expect(passesValidation(r("codabar", "A1B"))).toBe(true);
    expect(passesValidation(r("codabar", "12"))).toBe(false);
  });
  it("no filtra formatos con checksum fuerte", () => {
    expect(passesValidation(r("ean_13", "1"))).toBe(true);
    expect(passesValidation(r("qr_code", ""))).toBe(true);
  });
});

describe("confidenceOf", () => {
  it("2D siempre 1", () => expect(confidenceOf("qr_code", 0)).toBe(1));
  it("1D según líneas, con suelo para checksum fuerte", () => {
    expect(confidenceOf("code_39", 1)).toBe(0.25);
    expect(confidenceOf("code_39", 8)).toBe(1);
    expect(confidenceOf("ean_13", 1)).toBe(0.5);
    expect(confidenceOf("itf", 0)).toBe(0.5);
  });
});
