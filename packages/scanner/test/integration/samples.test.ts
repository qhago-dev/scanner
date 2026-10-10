// Corrección contra los samples de zxing-cpp: en cada set de los 13 formatos, a 0° y con
// strategy "balanced", leemos al menos tantos como exige el blackbox upstream con tryHarder.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FORMATS } from "../../src/formats";
import { decode } from "../../src/index.node";
import { DIR_FORMAT, imagesIn, matches, samplesAvailable, upstreamThresholds } from "../samples";

describe.skipIf(!samplesAvailable)("samples de zxing-cpp vs umbrales del blackbox upstream", () => {
  const thresholds = samplesAvailable ? upstreamThresholds() : [];

  it("encuentra umbrales para los 13 formatos", () => {
    const bases = new Set(thresholds.map((t) => DIR_FORMAT[t.dir.replace(/-\d+$/, "")]));
    expect([...bases].sort()).toEqual([...FORMATS].sort());
  });

  for (const t of thresholds) {
    it(`${t.dir}: ≥ ${t.minHarderRot0} lecturas correctas`, async () => {
      const format = DIR_FORMAT[t.dir.replace(/-\d+$/, "")] as (typeof FORMATS)[number];
      let ok = 0;
      for (const s of imagesIn(t.dir)) {
        if (s.expected === null && s.expectedBytes === null) continue;
        const res = await decode(readFileSync(s.file), {
          formats: [format],
          validateChecksums: false,
        });
        if (res.some((r) => matches(s, r))) ok++;
      }
      expect(ok).toBeGreaterThanOrEqual(t.minHarderRot0);
    });
  }

  it("falsepositives-*: ninguna lectura con los formatos por defecto", async () => {
    for (const dir of ["falsepositives-1", "falsepositives-2"]) {
      for (const { file } of imagesIn(dir))
        expect(await decode(readFileSync(file)), file).toEqual([]);
    }
  });
});
