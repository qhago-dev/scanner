import type { Engine } from "./engines/types";
import {
  type Aggregate,
  aggregate,
  equivalent,
  falseMetric,
  pairedBootstrap,
  recallMetric,
  type SampleRun,
  verdict,
} from "./metrics";

export interface BenchMeta {
  dataset: string;
  split: string;
  date: string;
  commit: string;
  cpu: string;
  runtime: string;
  reason?: string;
}

const pc = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)} %` : "—");
const pp = (v: number) =>
  Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)} pp` : "—";
const ms = (v: number) => (Number.isFinite(v) ? `${v.toFixed(1)}` : "—");
/** Mínimo de muestras en un escenario para que tenga gate (README del roadmap). */
export const MIN_GATE_N = 60;

export function buildReport(
  meta: BenchMeta,
  engines: Engine[],
  runs: Map<string, SampleRun[]>,
  base = "qhago",
) {
  const scenarios = [
    ...new Set([...runs.values()].flat().flatMap((r) => r.sample.scenarios)),
  ].sort();
  const formats = [
    ...new Set([...runs.values()].flat().flatMap((r) => r.sample.codes.map((c) => c.format))),
  ].sort();
  const global: Record<string, Aggregate> = {};
  const byScenario: Record<string, Record<string, Aggregate>> = {};
  for (const e of engines) {
    const rs = runs.get(e.name) ?? [];
    global[e.name] = aggregate(rs);
    byScenario[e.name] = Object.fromEntries(
      scenarios.map((s) => [s, aggregate(rs.filter((r) => r.sample.scenarios.includes(s)))]),
    );
  }
  const baseRuns = runs.get(base) ?? [];
  const comparisons = engines
    .filter((e) => e.name !== base && baseRuns.length)
    .map((e) => {
      const other = runs.get(e.name) ?? [];
      const recall = pairedBootstrap(baseRuns, other, recallMetric);
      const falseR = pairedBootstrap(other, baseRuns, falseMetric); // positivo = el otro tiene MÁS lecturas falsas
      const perScenario = Object.fromEntries(
        scenarios.map((s) => {
          const f = (rs: SampleRun[]) => rs.filter((r) => r.sample.scenarios.includes(s));
          const d = pairedBootstrap(f(baseRuns), f(other), recallMetric);
          return [s, { ...d, verdict: d.n >= MIN_GATE_N ? verdict(d) : "sin gate (n<60)" }];
        }),
      );
      return {
        engine: e.name,
        recall: { ...recall, verdict: verdict(recall) },
        falseReads: { ...falseR, verdict: verdict(falseR) },
        perScenario,
      };
    });

  const L: string[] = [];
  L.push(`# Benchmark — ${meta.dataset} / ${meta.split}`, "");
  L.push(`Fecha ${meta.date} · commit \`${meta.commit}\` · ${meta.runtime} · CPU ${meta.cpu}`);
  if (meta.reason) L.push(`Motivo de la ejecución sobre test: ${meta.reason}`);
  if (meta.dataset !== "real") {
    L.push(
      "",
      `> **No representativo de cámaras reales** (dataset ${meta.dataset}). No sirve para los gates G2/G3/G5.`,
    );
  }
  L.push("", "## Motores", "", "| Motor | Versión | Configuración |", "|---|---|---|");
  for (const e of engines) L.push(`| ${e.name} | ${e.version} | ${e.notes} |`);
  L.push(
    "",
    "## Global",
    "",
    "| Motor | Muestras | Recall (muestra) | Recall (código) | Lecturas falsas | Tasa falsa | FP en negativas | p50 ms | p95 ms | p99 ms |",
    "|---|---|---|---|---|---|---|---|---|---|",
  );
  for (const e of engines) {
    const g = global[e.name] as Aggregate;
    L.push(
      `| ${e.name} | ${g.samples} | ${pc(g.recallSample)} | ${pc(g.recallCode)} | ${g.falseReads} | ${pc(g.falseReadRate)} | ${pc(g.negativesFp)} | ${ms(g.p50)} | ${ms(g.p95)} | ${ms(g.p99)} |`,
    );
  }
  L.push(
    "",
    "## Recall por escenario",
    "",
    `| Escenario | n | ${engines.map((e) => e.name).join(" | ")} |`,
    `|---|---|${engines.map(() => "---").join("|")}|`,
  );
  for (const s of scenarios) {
    const n = byScenario[engines[0]?.name ?? ""]?.[s]?.positives ?? 0;
    L.push(
      `| ${s} | ${n} | ${engines.map((e) => pc(byScenario[e.name]?.[s]?.recallSample ?? Number.NaN)).join(" | ")} |`,
    );
  }
  L.push(
    "",
    "## Recall por formato (por código; — = el motor no soporta el formato)",
    "",
    `| Formato | ${engines.map((e) => e.name).join(" | ")} |`,
    `|---|${engines.map(() => "---").join("|")}|`,
  );
  for (const f of formats) {
    const cells = engines.map((e) => {
      if (!e.supports.includes(f)) return "—";
      const rs = (runs.get(e.name) ?? []).filter((r) => r.sample.codes.some((c) => c.format === f));
      let exp = 0;
      let ok = 0;
      for (const r of rs) {
        for (const c of r.sample.codes.filter((c) => c.format === f)) {
          exp++;
          if (r.detected.some((d) => equivalent(c, d))) ok++;
        }
      }
      return exp ? pc(ok / exp) : "—";
    });
    L.push(`| ${f} | ${cells.join(" | ")} |`);
  }
  if (comparisons.length) {
    L.push(
      "",
      `## Comparaciones pareadas (${base} − otro; IC 95 % bootstrap por objeto)`,
      "",
      "| vs | Δ recall | IC 95 % | Veredicto | Δ lecturas falsas (otro − qhago) | IC 95 % |",
      "|---|---|---|---|---|---|",
    );
    for (const c of comparisons) {
      L.push(
        `| ${c.engine} | ${pp(c.recall.diff)} | [${pp(c.recall.lo)}, ${pp(c.recall.hi)}] | ${c.recall.verdict} | ${pp(c.falseReads.diff)} | [${pp(c.falseReads.lo)}, ${pp(c.falseReads.hi)}] |`,
      );
    }
    L.push(
      "",
      "Por escenario (Δ recall, veredicto; gate solo con n ≥ 60):",
      "",
      `| Escenario | ${comparisons.map((c) => c.engine).join(" | ")} |`,
      `|---|${comparisons.map(() => "---").join("|")}|`,
    );
    for (const s of scenarios) {
      L.push(
        `| ${s} | ${comparisons
          .map((c) => {
            const d = c.perScenario[s];
            return d ? `${pp(d.diff)} (${d.verdict})` : "—";
          })
          .join(" | ")} |`,
      );
    }
  }
  return {
    markdown: `${L.join("\n")}\n`,
    json: {
      meta,
      engines: engines.map(({ name, version, notes }) => ({ name, version, notes })),
      global,
      byScenario,
      comparisons,
    },
  };
}
