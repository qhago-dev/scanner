import { describe, expect, it } from "bun:test";
import type { Sample } from "./dataset/manifest";
import {
  aggregate,
  equivalent,
  objectCounts,
  pairedBootstrap,
  recallMetric,
  type SampleRun,
  scoreSample,
  signTest,
  upper95,
  verdict,
} from "./metrics";

const sample = (id: string, codes: Sample["codes"], complete = true, object = id): Sample => ({
  id,
  file: "",
  path: "",
  sha256: "",
  kind: "image",
  codes,
  complete,
  scenarios: ["normal"],
  source: "t",
  license: "own",
  object,
  split: "test",
});
const run = (s: Sample, detected: SampleRun["detected"], ms = 1): SampleRun => ({
  sample: s,
  detected,
  ms,
});

describe("métricas", () => {
  it("UPC-A ≡ EAN-13 con 0 inicial", () => {
    expect(
      equivalent(
        { format: "ean_13", text: "0012345678905" },
        { format: "upc_a", text: "012345678905" },
      ),
    ).toBe(true);
    expect(
      equivalent(
        { format: "ean_13", text: "1012345678905" },
        { format: "upc_a", text: "012345678905" },
      ),
    ).toBe(false);
  });

  it("lecturas falsas: texto incorrecto, extra en complete y en negativas", () => {
    const s = sample("a", [{ format: "ean_13", text: "1" }]);
    expect(scoreSample(run(s, [{ format: "ean_13", text: "2" }]))).toMatchObject({
      found: 0,
      falseReads: 1,
    });
    expect(
      scoreSample(
        run(s, [
          { format: "ean_13", text: "1" },
          { format: "qr_code", text: "x" },
        ]),
      ),
    ).toMatchObject({ found: 1, falseReads: 1 });
    const incomplete = sample("b", [{ format: "ean_13", text: "1" }], false);
    expect(scoreSample(run(incomplete, [{ format: "qr_code", text: "x" }])).falseReads).toBe(0);
    const neg = sample("n", []);
    expect(aggregate([run(neg, [{ format: "qr_code", text: "x" }])]).negativesFp).toBe(1);
  });

  it("aggregate: recall por muestra y por código", () => {
    const s1 = sample("1", [
      { format: "qr_code", text: "a" },
      { format: "qr_code", text: "b" },
    ]);
    const s2 = sample("2", [{ format: "qr_code", text: "c" }]);
    const a = aggregate([
      run(s1, [{ format: "qr_code", text: "a" }]),
      run(s2, [{ format: "qr_code", text: "c" }]),
    ]);
    expect(a.recallSample).toBe(0.5);
    expect(a.recallCode).toBeCloseTo(2 / 3);
  });

  it("bootstrap pareado: A siempre mejor ⇒ 'mejor'; iguales ⇒ 'no peor'", () => {
    const ss = Array.from({ length: 200 }, (_, i) =>
      sample(`s${i}`, [{ format: "qr_code", text: `${i}` }], true, `o${i % 50}`),
    );
    const good = ss.map((s) => run(s, [{ format: "qr_code", text: s.codes[0]?.text ?? "" }]));
    const half = ss.map((s, i) =>
      run(s, i % 2 ? [] : [{ format: "qr_code", text: s.codes[0]?.text ?? "" }]),
    );
    const d = pairedBootstrap(good, half, recallMetric);
    expect(d.diff).toBeCloseTo(0.5, 1);
    expect(d.objects).toBe(50);
    expect(verdict(d)).toBe("mejor");
    expect(verdict(pairedBootstrap(good, good, recallMetric))).toBe("no peor");
  });
});

describe("estadística F10.5", () => {
  it("test de signos y Clopper-Pearson", () => {
    expect(signTest(8, 0)).toBeCloseTo(2 / 256, 6);
    expect(signTest(5, 5)).toBe(1);
    expect(signTest(0, 0)).toBe(1);
    // 0/300 → 1 − 0,025^(1/300) ≈ 1,22 %
    expect(upper95(0, 300)).toBeCloseTo(1 - 0.025 ** (1 / 300), 4);
    expect(upper95(5, 100)).toBeGreaterThan(0.05);
    expect(upper95(5, 100)).toBeLessThan(0.12);
  });
  it("objectCounts agrupa por objeto", () => {
    // 3 muestras del mismo objeto en las que A gana: cuenta 1 objeto, no 3
    const ss = [0, 1, 2].map((i) =>
      sample(`s${i}`, [{ format: "qr_code", text: "x" }], true, "o1"),
    );
    const s4 = sample("s4", [{ format: "qr_code", text: "y" }], true, "o2");
    const a = [...ss.map((s) => run(s, [{ format: "qr_code", text: "x" }])), run(s4, [])];
    const b = [...ss.map((s) => run(s, [])), run(s4, [{ format: "qr_code", text: "y" }])];
    expect(objectCounts(a, b, recallMetric)).toMatchObject({ wins: 1, losses: 1, ties: 0, p: 1 });
  });
  it("bootstrap devuelve se y mde", () => {
    const ss = Array.from({ length: 100 }, (_, i) =>
      sample(`s${i}`, [{ format: "qr_code", text: `${i}` }], true, `o${i % 40}`),
    );
    const good = ss.map((s) => run(s, [{ format: "qr_code", text: s.codes[0]?.text ?? "" }]));
    const half = ss.map((s, i) =>
      run(s, i % 3 ? [] : [{ format: "qr_code", text: s.codes[0]?.text ?? "" }]),
    );
    const d = pairedBootstrap(good, half, recallMetric);
    expect(d.se).toBeGreaterThan(0);
    expect(d.mde).toBeCloseTo(2.8 * d.se, 9);
  });
});
