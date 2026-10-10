import type { Sample } from "./dataset/manifest";
import type { Detected } from "./engines/types";

export interface SampleRun {
  sample: Sample;
  detected: Detected[];
  ms: number;
  error?: string;
}

/** EAN-13 y UPC-A se comparan en forma GTIN-13 (UPC-A = EAN-13 con 0 inicial; 12 o 13 dígitos). */
function gtin13(c: { format: string; text: string }): string | null {
  if (c.format !== "ean_13" && c.format !== "upc_a") return null;
  return c.text.trim().padStart(13, "0");
}

export function equivalent(
  a: { format: string; text: string },
  b: { format: string; text: string },
): boolean {
  const ga = gtin13(a);
  const gb = gtin13(b);
  if (ga !== null || gb !== null) return ga !== null && ga === gb;
  return (
    a.format === b.format &&
    (a.text === b.text || a.text === b.text.trimEnd() || a.text.trimEnd() === b.text)
  );
}

export interface SampleScore {
  expected: number;
  found: number;
  allFound: boolean;
  reads: number;
  falseReads: number;
  negative: boolean;
}

export function scoreSample(run: SampleRun): SampleScore {
  const { sample, detected } = run;
  const matched = new Set<number>();
  let falseReads = 0;
  for (const d of detected) {
    const i = sample.codes.findIndex((c, k) => !matched.has(k) && equivalent(c, d));
    if (i >= 0) matched.add(i);
    else if (sample.complete || sample.codes.some((c) => c.format === d.format)) falseReads++;
  }
  const expected = sample.codes.length;
  return {
    expected,
    found: matched.size,
    allFound: expected > 0 && matched.size === expected,
    reads: detected.length,
    falseReads,
    negative: expected === 0,
  };
}

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return Number.NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i] ?? Number.NaN;
}

export interface Aggregate {
  samples: number;
  positives: number;
  negatives: number;
  recallSample: number;
  recallCode: number;
  reads: number;
  falseReads: number;
  falseReadRate: number;
  negativesFp: number;
  p50: number;
  p95: number;
  p99: number;
  errors: number;
}

export function aggregate(runs: SampleRun[]): Aggregate {
  const scores = runs.map(scoreSample);
  const pos = scores.filter((s) => !s.negative);
  const neg = scores.filter((s) => s.negative);
  const exp = pos.reduce((a, s) => a + s.expected, 0);
  const found = pos.reduce((a, s) => a + s.found, 0);
  const reads = scores.reduce((a, s) => a + s.reads, 0);
  const falseReads = scores.reduce((a, s) => a + s.falseReads, 0);
  const ms = runs.map((r) => r.ms).sort((a, b) => a - b);
  return {
    samples: runs.length,
    positives: pos.length,
    negatives: neg.length,
    recallSample: pos.length ? pos.filter((s) => s.allFound).length / pos.length : Number.NaN,
    recallCode: exp ? found / exp : Number.NaN,
    reads,
    falseReads,
    falseReadRate: reads ? falseReads / reads : 0,
    negativesFp: neg.length ? neg.filter((s) => s.reads > 0).length / neg.length : Number.NaN,
    p50: pct(ms, 50),
    p95: pct(ms, 95),
    p99: pct(ms, 99),
    errors: runs.filter((r) => r.error).length,
  };
}

/** PRNG determinista (mulberry32) para que el bootstrap sea reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PairedDiff {
  diff: number;
  lo: number;
  hi: number;
  n: number;
  objects: number;
}

/**
 * Diferencia pareada A − B de una métrica por muestra (1/0), con IC 95 % por bootstrap
 * remuestreando OBJETOS físicos (todas las muestras de un objeto entran o salen juntas).
 */
export function pairedBootstrap(
  a: SampleRun[],
  b: SampleRun[],
  metric: (s: SampleScore) => number | null,
  iters = 2000,
  seed = 42,
): PairedDiff {
  const byId = new Map(b.map((r) => [r.sample.id, r]));
  const groups = new Map<string, number[]>();
  let n = 0;
  for (const ra of a) {
    const rb = byId.get(ra.sample.id);
    if (!rb) continue;
    const ma = metric(scoreSample(ra));
    const mb = metric(scoreSample(rb));
    if (ma === null || mb === null) continue;
    n++;
    const g = groups.get(ra.sample.object) ?? [];
    g.push(ma - mb);
    groups.set(ra.sample.object, g);
  }
  const keys = [...groups.values()];
  const mean = (gs: number[][]) => {
    let s = 0;
    let c = 0;
    for (const g of gs) {
      for (const v of g) {
        s += v;
        c++;
      }
    }
    return c ? s / c : Number.NaN;
  };
  const diff = mean(keys);
  const r = rng(seed);
  const dist: number[] = [];
  for (let i = 0; i < iters && keys.length; i++) {
    const pick: number[][] = [];
    for (let k = 0; k < keys.length; k++)
      pick.push(keys[Math.floor(r() * keys.length)] as number[]);
    dist.push(mean(pick));
  }
  dist.sort((x, y) => x - y);
  return { diff, lo: pct(dist, 2.5), hi: pct(dist, 97.5), n, objects: keys.length };
}

/** Veredictos del README del roadmap: "no peor" = lo ≥ −2 pp; "mejor" = lo > 0. */
export function verdict(d: PairedDiff): "mejor" | "no peor" | "peor" | "sin datos" {
  if (!Number.isFinite(d.lo)) return "sin datos";
  if (d.lo > 0) return "mejor";
  if (d.lo >= -0.02) return "no peor";
  return "peor";
}

export const recallMetric = (s: SampleScore) => (s.negative ? null : s.allFound ? 1 : 0);
export const falseMetric = (s: SampleScore) =>
  s.reads > 0 || s.negative ? (s.falseReads > 0 ? 1 : 0) : null;
