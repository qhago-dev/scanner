import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSplit, logRun } from "./guard";

describe("guarda de splits", () => {
  test("dev siempre permitido y sin registro", () => {
    expect(checkSplit({ split: "dev" })).toBeNull();
    const out = mkdtempSync(join(tmpdir(), "guard-"));
    expect(logRun({ split: "dev", runner: "cli", dataset: "x", engines: "q", out })).toBeNull();
  });
  test("test exige motivo", () => {
    expect(checkSplit({ split: "test" })).toContain("--reason");
    expect(checkSplit({ split: "test", reason: "gate" })).toBeNull();
  });
  test("holdout exige motivo y --holdout-ok", () => {
    expect(checkSplit({ split: "holdout", reason: "r" })).toContain("--holdout-ok");
    expect(checkSplit({ split: "holdout", holdoutOk: true })).toContain("--reason");
    expect(checkSplit({ split: "holdout", reason: "r", holdoutOk: true })).toBeNull();
  });
  test("split desconocido", () => {
    expect(checkSplit({ split: "train" })).toContain("dev | test | holdout");
  });
  test("registra test y holdout en archivos separados", () => {
    const out = mkdtempSync(join(tmpdir(), "guard-"));
    const g = { runner: "video", dataset: "public", engines: "qhago", out, reason: "motivo" };
    const t = logRun({ ...g, split: "test" }, "2026-10-12");
    const h = logRun({ ...g, split: "holdout" }, "2026-10-12");
    expect(t).toEndWith("test-runs.md");
    expect(h).toEndWith("holdout-runs.md");
    const body = readFileSync(h as string, "utf8");
    expect(body).toContain("| 2026-10-12 |");
    expect(body).toContain("| motivo | video |");
  });
});
