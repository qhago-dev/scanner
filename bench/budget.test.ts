import { describe, expect, it } from "bun:test";
import { type Budgets, check, inferHw, setBudgets } from "./budget";

const img = (p95: number, p99: number) => ({
  meta: { dataset: "public", split: "dev", cpu: "12th Gen Intel(R) Core(TM) i9-12900H" },
  global: { qhago: { p95, p99 } },
});
const vid = (over: number) => ({
  meta: { kind: "video" as const, dataset: "synthetic-video", split: "dev", slowdown: 5 },
  engines: { qhago: { framesOver150Pct: over, frameP95: 100, ttfrP50: 900 } },
});

describe("presupuestos", () => {
  it("mediana × margen por motor y clave", () => {
    const b = setBudgets({}, "dev-local", [img(100, 200), img(300, 400), img(200, 300)]);
    expect(b["dev-local"]?.["public/dev"]?.qhago).toEqual({ p95: 220, p99: 330 });
    const v = setBudgets(b, "dev-local", [vid(2), vid(4), vid(3)]);
    expect(v["dev-local"]?.["synthetic-video/dev@x5"]?.qhago?.framesOver150Pct).toBeCloseTo(3.3);
    expect(v["dev-local"]?.["public/dev"]).toBeDefined();
  });
  it("detecta excesos y tolera claves sin presupuesto", () => {
    const b: Budgets = { "dev-local": { "public/dev": { qhago: { p95: 220, p99: 330 } } } };
    expect(check(b, "dev-local", img(200, 300)).every((c) => c.ok)).toBe(true);
    const bad = check(b, "dev-local", img(250, 300));
    expect(bad.find((c) => c.metric === "p95")?.ok).toBe(false);
    expect(check(b, "dev-local", vid(50)).every((c) => c.ok && c.limit === null)).toBe(true);
  });
  it("infiere el hardware por el modelo de CPU", () => {
    const b = { _cpu: { "dev-local": "i9-12900H" } } as unknown as Budgets;
    expect(inferHw(b, img(1, 1).meta.cpu)).toBe("dev-local");
    expect(inferHw(b, "AMD EPYC")).toBeNull();
  });
});
