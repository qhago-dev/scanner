import { describe, expect, it } from "bun:test";
import type { Sample } from "./dataset/manifest";
import type { Engine } from "./engines/types";
import type { SampleRun } from "./metrics";
import { buildReport } from "./report";

const sample = (id: string, license: string): Sample => ({
  id,
  file: "",
  path: "",
  sha256: "",
  kind: "image",
  codes: [{ format: "ean_13", text: "4006381333931" }],
  complete: false,
  scenarios: ["normal"],
  source: "t",
  license,
  object: id,
  split: "dev",
});
const engine = {
  name: "qhago",
  version: "0",
  notes: "",
  supports: ["ean_13"],
} as unknown as Engine;
const meta = { dataset: "x", split: "dev", date: "d", commit: "c", cpu: "cpu", runtime: "bun" };
const hit = [{ format: "ean_13" as const, text: "4006381333931" }];

describe("reporte", () => {
  it("añade la fila publicable sin las muestras research-only", () => {
    const runs = new Map<string, SampleRun[]>([
      [
        "qhago",
        [
          { sample: sample("a", "CC-BY-4.0"), detected: hit, ms: 1 },
          { sample: sample("b", "research-only"), detected: [], ms: 1 },
        ],
      ],
    ]);
    const { markdown, json } = buildReport(meta, [engine], runs);
    expect(markdown).toContain("| qhago (publicable) | 1 | 100.0 %");
    expect(markdown).toContain("| qhago | 2 | 50.0 %");
    expect((json as { publishable?: unknown }).publishable).toBeDefined();
  });
  it("sin research-only no hay fila publicable", () => {
    const runs = new Map<string, SampleRun[]>([
      ["qhago", [{ sample: sample("a", "own"), detected: hit, ms: 1 }]],
    ]);
    expect(buildReport(meta, [engine], runs).markdown).not.toContain("publicable");
  });
});
