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
  /** Objetos con al menos una muestra en la que la métrica aplica (en recall: objetos con código). */
  objects: number;
  /** Desviación típica de la distribución bootstrap de la diferencia. */
  se: number;
  /**
   * "MDE de esta comparación" = 2,8·se (80 % de potencia, α = 0,05). Informativo: con motores casi idénticos el se
   * es pequeño y NO es la potencia para 5 pp de F1.9.
   */
  mde: number;
}

/** Por debajo de este número de objetos el IC por objeto es poco fiable (aviso, no cambia el veredicto). */
export const FEW_OBJECTS = 30;

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
  const m = dist.reduce((s, v) => s + v, 0) / (dist.length || 1);
  const se = dist.length
    ? Math.sqrt(dist.reduce((s, v) => s + (v - m) * (v - m), 0) / dist.length)
    : Number.NaN;
  return {
    diff,
    lo: pct(dist, 2.5),
    hi: pct(dist, 97.5),
    n,
    objects: keys.length,
    se,
    mde: 2.8 * se,
  };
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

/** log C(n, k) por suma de logaritmos (n pequeño-medio: test de signos, Clopper-Pearson). */
function logChoose(n: number, k: number): number {
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
  return s;
}

/** P(X ≤ k) con X ~ Bin(n, p). */
export function binomCdf(k: number, n: number, p: number): number {
  if (k < 0) return 0;
  if (k >= n) return 1;
  if (p <= 0) return 1;
  if (p >= 1) return 0;
  let s = 0;
  for (let i = 0; i <= k; i++)
    s += Math.exp(logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  return Math.min(1, s);
}

/** Test de signos exacto bilateral: p de observar un reparto tan desigual como `wins` vs `losses` con p = 0,5. */
export function signTest(wins: number, losses: number): number {
  const n = wins + losses;
  if (n === 0) return 1;
  const k = Math.min(wins, losses);
  return Math.min(1, 2 * binomCdf(k, n, 0.5));
}

/** Cota superior Clopper-Pearson al 95 % (bilateral) de una tasa con k eventos en n (0/300 → ~1,2 %). */
export function upper95(k: number, n: number): number {
  if (n === 0) return Number.NaN;
  if (k >= n) return 1;
  // p tal que P(X ≤ k | n, p) = 0,025 (bisección: la CDF decrece con p)
  let lo = k / n;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (binomCdf(k, n, mid) > 0.025) lo = mid;
    else hi = mid;
  }
  return hi;
}

export interface ObjectCounts {
  /** Objetos en los que A suma más aciertos que B (neto de sus muestras). */
  wins: number;
  losses: number;
  ties: number;
  /** Test de signos exacto bilateral sobre los objetos discordantes. */
  p: number;
}

/**
 * Comparación por OBJETO (F10.5): cada objeto se resume en gana / pierde / empata según Σ (A − B) de sus
 * muestras. Las muestras de un objeto (variantes de una foto, varias fotos de un producto) no son independientes.
 */
export function objectCounts(
  a: SampleRun[],
  b: SampleRun[],
  metric: (s: SampleScore) => number | null,
): ObjectCounts {
  const byId = new Map(b.map((r) => [r.sample.id, r]));
  const net = new Map<string, number>();
  for (const ra of a) {
    const rb = byId.get(ra.sample.id);
    if (!rb) continue;
    const ma = metric(scoreSample(ra));
    const mb = metric(scoreSample(rb));
    if (ma === null || mb === null) continue;
    net.set(ra.sample.object, (net.get(ra.sample.object) ?? 0) + ma - mb);
  }
  let wins = 0;
  let losses = 0;
  let ties = 0;
  for (const v of net.values()) {
    if (v > 0) wins++;
    else if (v < 0) losses++;
    else ties++;
  }
  return { wins, losses, ties, p: signTest(wins, losses) };
}
