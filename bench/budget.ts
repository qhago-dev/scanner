// Presupuestos de latencia por hardware (F10.6).
// Comprobar: bun run budget.ts <reporte.json>... [--hw dev-local]        → exit 1 si algo se excede
// Fijar:     bun run budget.ts --set <r1.json> <r2.json> <r3.json> [--hw dev-local] [--margin 1.1]
//            (mediana de las ejecuciones × margen, por motor; reemplaza solo las claves de esos reportes)
// Claves: imagen "<dataset>/<split>" (métricas p95, p99 de cli.ts); vídeo "<dataset>/<split>@x<slowdown>"
// (framesOver150Pct, frameP95, ttfrP50 de runners/video.ts).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

export type Budgets = Record<string, Record<string, Record<string, Record<string, number>>>> & {
  _cpu?: Record<string, string>;
};

interface ImageReport {
  meta: { dataset: string; split: string; cpu?: string };
  global: Record<string, { p95: number; p99: number }>;
}
interface VideoReport {
  meta: { kind: "video"; dataset: string; split: string; slowdown: number };
  engines: Record<string, Record<string, number>>;
}
type Report = ImageReport | VideoReport;

const IMAGE_METRICS = ["p95", "p99"] as const;
const VIDEO_METRICS = ["framesOver150Pct", "frameP95", "ttfrP50"] as const;

/** Clave del reporte y métricas por motor. */
export function metricsOf(r: Report): {
  key: string;
  values: Record<string, Record<string, number>>;
} {
  if ("engines" in r && r.meta.kind === "video") {
    const values: Record<string, Record<string, number>> = {};
    for (const [e, g] of Object.entries(r.engines))
      values[e] = Object.fromEntries(VIDEO_METRICS.map((m) => [m, g[m] as number]));
    return { key: `${r.meta.dataset}/${r.meta.split}@x${r.meta.slowdown}`, values };
  }
  const ir = r as ImageReport;
  const values: Record<string, Record<string, number>> = {};
  for (const [e, g] of Object.entries(ir.global))
    values[e] = Object.fromEntries(IMAGE_METRICS.map((m) => [m, g[m]]));
  return { key: `${ir.meta.dataset}/${ir.meta.split}`, values };
}

export interface Check {
  key: string;
  engine: string;
  metric: string;
  value: number;
  limit: number | null;
  ok: boolean;
}

export function check(b: Budgets, hw: string, r: Report): Check[] {
  const { key, values } = metricsOf(r);
  const out: Check[] = [];
  for (const [engine, ms] of Object.entries(values))
    for (const [metric, value] of Object.entries(ms)) {
      const limit = b[hw]?.[key]?.[engine]?.[metric] ?? null;
      out.push({ key, engine, metric, value, limit, ok: limit === null || !(value > limit) });
    }
  return out;
}

const median = (v: number[]) => {
  const s = [...v].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

/** Mediana por (clave, motor, métrica) de varias ejecuciones × margen. */
export function setBudgets(b: Budgets, hw: string, reports: Report[], margin = 1.1): Budgets {
  const acc = new Map<string, number[]>();
  for (const r of reports) {
    const { key, values } = metricsOf(r);
    for (const [e, ms] of Object.entries(values))
      for (const [m, v] of Object.entries(ms))
        if (Number.isFinite(v))
          acc.set(`${key}\u0000${e}\u0000${m}`, [
            ...(acc.get(`${key}\u0000${e}\u0000${m}`) ?? []),
            v,
          ]);
  }
  const next: Budgets = JSON.parse(JSON.stringify(b));
  next[hw] ??= {};
  const target = next[hw] as Record<string, Record<string, Record<string, number>>>;
  const keys = new Set([...acc.keys()].map((k) => k.split("\u0000")[0] as string));
  for (const k of keys) target[k] = {};
  for (const [id, vs] of acc) {
    const [k, e, m] = id.split("\u0000") as [string, string, string];
    (target[k] as Record<string, Record<string, number>>)[e] ??= {};
    const val = median(vs) * margin;
    ((target[k] as Record<string, Record<string, number>>)[e] as Record<string, number>)[m] =
      Math.round(val * 10) / 10;
  }
  return next;
}

/** Id de hardware a partir del modelo de CPU del reporte (`_cpu` en budgets.json). */
export function inferHw(b: Budgets, cpu?: string): string | null {
  if (!cpu) return null;
  for (const [hw, pattern] of Object.entries(b._cpu ?? {})) if (cpu.includes(pattern)) return hw;
  return null;
}

if (import.meta.main) {
  const { values: a, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      hw: { type: "string" },
      set: { type: "boolean", default: false },
      margin: { type: "string", default: "1.1" },
      budgets: { type: "string", default: join(import.meta.dir, "budgets.json") },
    },
  });
  const path = a.budgets as string;
  const b: Budgets = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const reports = positionals.map((p) => JSON.parse(readFileSync(p, "utf8")) as Report);
  if (!reports.length) {
    console.error("uso: bun run budget.ts [--set] <reporte.json>... [--hw dev-local]");
    process.exit(2);
  }
  const hw = a.hw ?? inferHw(b, (reports[0] as ImageReport).meta.cpu);
  if (!hw) {
    console.error("No se pudo inferir el hardware: usa --hw (ids en bench/HARDWARE.md).");
    process.exit(2);
  }
  if (a.set) {
    writeFileSync(
      path,
      `${JSON.stringify(setBudgets(b, hw, reports, Number(a.margin)), null, 2)}\n`,
    );
    console.log(
      `Presupuestos de ${hw} actualizados con ${reports.length} ejecuciones (× ${a.margin}).`,
    );
  } else {
    const rows = reports.flatMap((r) => check(b, hw, r));
    for (const c of rows)
      console.log(
        `${c.ok ? "ok      " : "EXCEDIDO"} ${c.key} ${c.engine} ${c.metric} = ${c.value.toFixed(1)}${c.limit === null ? " (sin presupuesto)" : ` (límite ${c.limit})`}`,
      );
    if (rows.some((c) => !c.ok)) process.exit(1);
  }
}
