import { describe, expect, it } from "vitest";
import { readBlurredEan } from "../../src/deblur";
import { fitSpan } from "../../src/deblur/ean";
import { image, modules } from "../deblur-fixture";

describe("deblur-ean", () => {
  it("perfil sintético: acierta con desenfoque de 0,3-0,9 módulos", () => {
    const bits = modules("7750182007269");
    for (const sg of [0.3, 0.6, 0.9]) {
      const w = 7.5;
      const left = 150;
      const n = Math.round(left * 2 + 95 * w);
      const q = new Float32Array(n);
      const k = 1 / (sg * w * Math.SQRT2);
      const erf = (x: number) => Math.tanh(1.20276058 * x); // aproximación suficiente para el test
      for (let x = 0; x < n; x++)
        for (let m = 0; m < 95; m++)
          if (bits[m] === "1") {
            const a = left + m * w;
            q[x] = (q[x] as number) + 0.5 * (erf((x - a) * k) - erf((x - a - w) * k));
          }
      const f = fitSpan(q, left, left + 95 * w);
      expect(f?.text, `σ=${sg}`).toBe("7750182007269");
      expect(f?.fit).toBeGreaterThan(0.95);
    }
  });

  it("foto vertical con un EAN-13 desenfocado (0,6 módulos, 4 px/módulo) y algo girado: lo lee", () => {
    const r = readBlurredEan(image("7501033204265", 4, 0.6, 12, 6));
    expect(r.map((x) => x.text)).toEqual(["7501033204265"]);
  });

  it("sin código (ruido / texto): no devuelve nada", () => {
    const W = 640;
    const H = 360;
    const data = new Uint8Array(W * H);
    let s = 1;
    for (let i = 0; i < data.length; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      data[i] = 120 + ((s >> 8) % 60);
    }
    expect(readBlurredEan({ kind: "luma", data, width: W, height: H, stride: W })).toEqual([]);
  });
});
