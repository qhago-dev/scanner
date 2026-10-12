// Comparación de dos ejecuciones de cli.ts (JSON con detalle por muestra, F10.5): criterios 1 y 2 de las mejoras.
// bun run diff.ts <base.json> <nuevo.json> [--engine qhago] [--engine-new qhago] [--strict]
//   - lecturas falsas NUEVAS foto a foto (criterio 2: deben ser 0; --strict → exit 1 si hay)
//   - ganadas/perdidas por objeto con test de signos, global y por escenario (criterio 1)
//   - p95/p99 base → nuevo
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { Sample } from "./dataset/manifest";
import type { Detected } from "./engines/types";
import {
  equivalent,
  objectCounts,
  recallMetric,
  type SampleRun,
  scoreSample,
  upper95,
} from "./metrics";

interface SampleJson {
  id: string;
  object: string;
  scenarios: string[];
  codes: Sample["codes"];
  complete: boolean;
  detected: Detected[];
  ms: number;
}
interface ReportJson {
  meta: { dataset: string; split: string; commit: string };
  samples?: Record<string, SampleJson[]>;
}

export function toRuns(xs: SampleJson[]): SampleRun[] {
  return xs.map((x) => ({
    sample: {
      id: x.id,
      object: x.object,
      scenarios: x.scenarios,
      codes: x.codes,
      complete: x.complete,
      file: "",
      path: "",
      sha256: "",
      kind: "image",
      source: "",
      license: "",
      split: "dev",
    },
    detected: x.detected,
    ms: x.ms,
  }));
}

/** Lecturas falsas de una muestra como textos (mismo criterio que scoreSample). */
function falseTexts(r: SampleRun): string[] {
  const used = new Set<number>();
  const out: string[] = [];
  for (const d of r.detected) {
    const i = r.sample.codes.findIndex((c, k) => !used.has(k) && equivalent(c, d));
    if (i >= 0) used.add(i);
    else if (r.sample.complete || r.sample.codes.some((c) => c.format === d.format))
      out.push(`${d.format}:${d.text}`);
  }
  return out;
}

export interface DiffResult {
  newFalse: { id: string; reads: string[] }[];
  goneFalse: number;
  byObject: ReturnType<typeof objectCounts>;
  byScenario: Record<string, ReturnType<typeof objectCounts>>;
  latency: { base: [number, number]; next: [number, number] };
  falseNext: { reads: number; samples: number; upper: number };
}

const q = (v: number[], p: number) => {
  const s = [...v].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))] ?? Number.NaN;
};

export function diffRuns(base: SampleRun[], next: SampleRun[]): DiffResult {
  const byId = new Map(base.map((r) => [r.sample.id, r]));
  const newFalse: DiffResult["newFalse"] = [];
  let goneFalse = 0;
  for (const r of next) {
    const b = byId.get(r.sample.id);
    if (!b) continue;
    const before = new Set(falseTexts(b));
    const after = falseTexts(r);
    const fresh = after.filter((t) => !before.has(t));
    if (fresh.length) newFalse.push({ id: r.sample.id, reads: fresh });
    goneFalse += [...before].filter((t) => !after.includes(t)).length;
  }
  const scen = [...new Set(next.flatMap((r) => r.sample.scenarios))].sort();
  const f = (rs: SampleRun[], s: string) => rs.filter((r) => r.sample.scenarios.includes(s));
  const withFalse = next.filter((r) => scoreSample(r).falseReads > 0).length;
  return {
    newFalse,
    goneFalse,
    byObject: objectCounts(next, base, recallMetric),
    byScenario: Object.fromEntries(
      scen.map((s) => [s, objectCounts(f(next, s), f(base, s), recallMetric)]),
    ),
    latency: {
      base: [
        q(
          base.map((r) => r.ms),
          95,
        ),
        q(
          base.map((r) => r.ms),
          99,
        ),
      ],
      next: [
        q(
          next.map((r) => r.ms),
          95,
        ),
        q(
          next.map((r) => r.ms),
          99,
        ),
      ],
    },
    falseNext: { reads: withFalse, samples: next.length, upper: upper95(withFalse, next.length) },
  };
}

if (import.meta.main) {
  const { values: a, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      engine: { type: "string", default: "qhago" },
      "engine-new": { type: "string" },
      strict: { type: "boolean", default: false },
    },
  });
  const [pb, pn] = positionals;
  if (!pb || !pn) {
    console.error("uso: bun run diff.ts <base.json> <nuevo.json> [--engine qhago] [--strict]");
    process.exit(2);
  }
  const load = (p: string, e: string) => {
    const j = JSON.parse(readFileSync(p, "utf8")) as ReportJson;
    const xs = j.samples?.[e];
    if (!xs) throw new Error(`${p}: sin detalle por muestra para "${e}" (¿JSON anterior a F10.5?)`);
    return { meta: j.meta, runs: toRuns(xs) };
  };
  const en = a["engine-new"] ?? a.engine ?? "qhago";
  const b = load(pb, a.engine ?? "qhago");
  const n = load(pn, en);
  const d = diffRuns(b.runs, n.runs);
  const pv = (p: number) => (p < 0.001 ? "< 0,001" : p.toFixed(3));
  const L = [
    `# Diff — ${n.meta.dataset}/${n.meta.split}: ${b.meta.commit} (${a.engine}) → ${n.meta.commit} (${en})`,
    "",
    `- Lecturas falsas nuevas: **${d.newFalse.length}**${d.newFalse.length ? ` (${d.newFalse.map((x) => `${x.id}=${x.reads.join("/")}`).join(", ")})` : ""}; desaparecidas: ${d.goneFalse}`,
    `- Muestras con lectura falsa (nuevo): ${d.falseNext.reads}/${d.falseNext.samples} (cota 95 % ≤ ${(d.falseNext.upper * 100).toFixed(2)} %)`,
    `- Por objeto (recall): +${d.byObject.wins} / −${d.byObject.losses} / =${d.byObject.ties}, test de signos p ${pv(d.byObject.p)}`,
    `- p95 ${d.latency.base[0].toFixed(0)} → ${d.latency.next[0].toFixed(0)} ms; p99 ${d.latency.base[1].toFixed(0)} → ${d.latency.next[1].toFixed(0)} ms`,
    "",
    "| Escenario | + | − | = | p |",
    "|---|---|---|---|---|",
    ...Object.entries(d.byScenario).map(
      ([s, o]) => `| ${s} | ${o.wins} | ${o.losses} | ${o.ties} | ${pv(o.p)} |`,
    ),
  ];
  console.log(L.join("\n"));
  if (a.strict && d.newFalse.length) process.exit(1);
}
