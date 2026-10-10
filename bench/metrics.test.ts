import { describe, expect, it } from "bun:test";
import type { Sample } from "./dataset/manifest";
import {
  aggregate,
  equivalent,
  pairedBootstrap,
  recallMetric,
  type SampleRun,
  scoreSample,
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
