import { describe, expect, it } from "bun:test";
import { diffRuns } from "./diff";
import type { SampleRun } from "./metrics";

const run = (
  id: string,
  object: string,
  detected: string[],
  text = "4006381333931",
): SampleRun => ({
  sample: {
    id,
    object,
    scenarios: ["blur-0.9"],
    codes: [{ format: "ean_13", text }],
    complete: true,
    file: "",
    path: "",
    sha256: "",
    kind: "image",
    source: "",
    license: "",
    split: "dev",
  },
  detected: detected.map((t) => ({ format: "ean_13", text: t })),
  ms: 10,
});

describe("diff", () => {
  it("detecta lecturas falsas nuevas y cuenta por objeto", () => {
    const base = [run("a", "o1", []), run("b", "o1", []), run("c", "o2", ["4006381333931"])];
    const next = [
      run("a", "o1", ["4006381333931"]),
      run("b", "o1", ["4006381333931"]),
      run("c", "o2", ["4006381333931", "9780201379624"]),
    ];
    const d = diffRuns(base, next);
    expect(d.newFalse).toEqual([{ id: "c", reads: ["ean_13:9780201379624"] }]);
    // o1 gana (2 muestras = 1 objeto); o2 empata en recall
    expect(d.byObject).toMatchObject({ wins: 1, losses: 0, ties: 1 });
    expect(d.byScenario["blur-0.9"]?.wins).toBe(1);
  });
  it("una falsa que ya estaba no es nueva", () => {
    const base = [run("a", "o1", ["9780201379624"])];
    expect(diffRuns(base, base).newFalse).toHaveLength(0);
  });
});
