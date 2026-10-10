import { describe, expect, it } from "vitest";
import { dropConflicts } from "../../src/conflicts";
import type { BarcodeFormat, BarcodeResult } from "../../src/types";

/** Resultado con quad horizontal de x0 a x1 a la altura y (alto 9 px, como devuelve ZXing en 1D). */
const r = (text: string, x0: number, x1: number, y: number, format: BarcodeFormat = "ean_13") =>
  ({
    format,
    text,
    cornerPoints: [
      { x: x0, y },
      { x: x1, y },
      { x: x1, y: y + 9 },
      { x: x0, y: y + 9 },
    ],
  }) as unknown as BarcodeResult;

describe("dropConflicts", () => {
  it("dos EAN distintos sobre el mismo símbolo → se descartan los dos (caso real Android)", () => {
    // Medido: 9238472016651 (y 548) y 3716652077839 (y 632) sobre 7750670011839, longitud ~215 px.
    expect(
      dropConflicts([r("9238472016651", 470, 256, 548), r("3716652077839", 256, 474, 632)]),
    ).toEqual([]);
  });
  it("mismo contenido en dos líneas → se conservan", () => {
    expect(
      dropConflicts([r("7750670011839", 256, 470, 548), r("7750670011839", 256, 470, 600)]),
    ).toHaveLength(2);
  });
  it("códigos distintos separados (uno al lado del otro o apilados lejos) → se conservan", () => {
    expect(dropConflicts([r("A", 0, 200, 100), r("B", 300, 500, 100)])).toHaveLength(2);
    expect(dropConflicts([r("A", 0, 200, 100), r("B", 0, 200, 260)])).toHaveLength(2);
  });
  it("2D no participa", () => {
    expect(dropConflicts([r("A", 0, 200, 100, "qr_code"), r("B", 0, 200, 120)])).toHaveLength(2);
  });
  it("solo cae el par en conflicto; el resto sigue", () => {
    const out = dropConflicts([r("A", 0, 200, 100), r("B", 0, 200, 140), r("C", 600, 800, 100)]);
    expect(out.map((x) => x.text)).toEqual(["C"]);
  });
});

describe("dropConflicts con consenso", () => {
  it("una lectura con mucho más consenso (quad alto) gana a una línea suelta (ean13-1/35 de zxing-cpp)", () => {
    const tall = {
      format: "ean_13",
      text: "5030159003930",
      cornerPoints: [
        { x: 219, y: 408 },
        { x: 219, y: 65 },
        { x: 102, y: 68 },
        { x: 102, y: 406 },
      ],
    } as unknown as BarcodeResult;
    const thin = {
      format: "ean_13",
      text: "7034759003930",
      cornerPoints: [
        { x: 70, y: 406 },
        { x: 70, y: 68 },
        { x: 67, y: 68 },
        { x: 67, y: 406 },
      ],
    } as unknown as BarcodeResult;
    expect(dropConflicts([thin, tall]).map((x) => x.text)).toEqual(["5030159003930"]);
  });
});
