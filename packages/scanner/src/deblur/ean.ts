// EAN-13 / UPC-A robusto al desenfoque: el perfil (barras = 1) se remuestrea a la cuadrícula de módulos,
// se deconvoluciona (mínimos cuadrados regularizados con un desenfoque gaussiano de σ módulos) y los 12
// dígitos se eligen por programación dinámica con paridad y dígito de control. La geometría (inicio, ancho,
// curvatura, σ) se busca maximizando la correlación del modelo completo con el perfil.
// Prototipo y medidas: training/research/deblur-ean/.

const L = [
  "0001101",
  "0011001",
  "0010011",
  "0111101",
  "0100011",
  "0110001",
  "0101111",
  "0111011",
  "0110111",
  "0001011",
];
const G = [
  "0100111",
  "0110011",
  "0011011",
  "0100001",
  "0011101",
  "0111001",
  "0000101",
  "0010001",
  "0001001",
  "0010111",
];
const R = [
  "1110010",
  "1100110",
  "1101100",
  "1000010",
  "1011100",
  "1001110",
  "1010000",
  "1000100",
  "1001000",
  "1110100",
];
const PARITY = [
  "LLLLLL",
  "LLGLGG",
  "LLGGLG",
  "LLGGGL",
  "LGLLGG",
  "LGGLLG",
  "LGGGLL",
  "LGLGLG",
  "LGLGGL",
  "LGGLGL",
];
const bits = (p: string) => Array.from(p, (c) => (c === "1" ? 1 : 0));
const LB = L.map(bits);
const GB = G.map(bits);
const RB = R.map(bits);

/** Muestras por módulo y módulos de margen a cada lado del símbolo. */
const K = 5;
const Q = 9;
const NM = 95 + 2 * Q;
const NS = NM * K;
const SIGMAS = [0.25, 0.45, 0.7, 0.95, 1.2] as const;
const LAMBDA = 0.05;

function erf(x: number): number {
  // Abramowitz-Stegun 7.1.26 (error < 1,5e-7)
  const s = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return s * y;
}

interface Solver {
  /** A: NS×NM (fila = muestra, columna = módulo), denso. */
  A: Float64Array;
  /** P = (AᵀA + λI)⁻¹Aᵀ: NM×NS. */
  P: Float64Array;
  /** Banda útil de cada fila de P: [lo, hi). */
  lo: Int32Array;
  hi: Int32Array;
}
const solvers = new Map<number, Solver>();

function solver(sg: number): Solver {
  const hit = solvers.get(sg);
  if (hit) return hit;
  const A = new Float64Array(NS * NM);
  const k = 1 / (sg * Math.SQRT2);
  for (let i = 0; i < NS; i++) {
    const x = (i + 0.5) / K;
    for (let m = 0; m < NM; m++) A[i * NM + m] = 0.5 * (erf((x - m) * k) - erf((x - m - 1) * k));
  }
  // M = AᵀA + λI y su inversa por Gauss-Jordan (NM = 113: ~1,4 M operaciones, una vez por σ).
  const n = NM;
  const M = new Float64Array(n * 2 * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      let s = 0;
      for (let i = 0; i < NS; i++) s += (A[i * NM + r] as number) * (A[i * NM + c] as number);
      M[r * 2 * n + c] = s + (r === c ? LAMBDA : 0);
    }
    M[r * 2 * n + n + r] = 1;
  }
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++)
      if (Math.abs(M[r * 2 * n + c] as number) > Math.abs(M[p * 2 * n + c] as number)) p = r;
    if (p !== c)
      for (let j = 0; j < 2 * n; j++) {
        const t = M[c * 2 * n + j] as number;
        M[c * 2 * n + j] = M[p * 2 * n + j] as number;
        M[p * 2 * n + j] = t;
      }
    const d = M[c * 2 * n + c] as number;
    for (let j = 0; j < 2 * n; j++) M[c * 2 * n + j] = (M[c * 2 * n + j] as number) / d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r * 2 * n + c] as number;
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++)
        M[r * 2 * n + j] = (M[r * 2 * n + j] as number) - f * (M[c * 2 * n + j] as number);
    }
  }
  const P = new Float64Array(NM * NS);
  for (let r = 0; r < n; r++)
    for (let i = 0; i < NS; i++) {
      let s = 0;
      for (let c = 0; c < n; c++) s += (M[r * 2 * n + n + c] as number) * (A[i * NM + c] as number);
      P[r * NS + i] = s;
    }
  const lo = new Int32Array(NM);
  const hi = new Int32Array(NM);
  for (let r = 0; r < NM; r++) {
    let mx = 0;
    for (let i = 0; i < NS; i++) mx = Math.max(mx, Math.abs(P[r * NS + i] as number));
    let a = 0;
    let b = NS;
    while (a < b && Math.abs(P[r * NS + a] as number) < 1e-3 * mx) a++;
    while (b > a && Math.abs(P[r * NS + b - 1] as number) < 1e-3 * mx) b--;
    lo[r] = a;
    hi[r] = b;
  }
  const out = { A, P, lo, hi };
  solvers.set(sg, out);
  return out;
}

export interface EanFit {
  text: string;
  /** Correlación del modelo completo con el perfil (0..1). */
  fit: number;
  /** Diferencia de puntuación (suma de −distancias²) con el mejor número de otra paridad. */
  margin: number;
  /** Bordes del símbolo en índices del perfil (izquierda < derecha según el perfil). */
  start: number;
  end: number;
}

/** DP: mejor y segundo mejor número válido a partir de los valores estimados por módulo (`bh`, NM). */
const slotL = new Float64Array(6 * 2 * 10); // [slot][L|G][dígito]
const slotR = new Float64Array(6 * 10);
const dp = new Float64Array(10);
const nd = new Float64Array(10);
const bp = new Int16Array(12 * 10); // retroceso: mod_previo * 10 + dígito
const ZERO_PATS = [LB, GB];

function slotScores(bh: Float64Array, rev: boolean): void {
  const at = (m: number) => (rev ? (bh[NM - 1 - (Q + m)] as number) : (bh[Q + m] as number));
  for (let i = 0; i < 6; i++)
    for (let k = 0; k < 2; k++) {
      const pats = ZERO_PATS[k] as number[][];
      for (let dg = 0; dg < 10; dg++) {
        const p = pats[dg] as number[];
        let sc = 0;
        for (let j = 0; j < 7; j++) {
          const e = at(3 + 7 * i + j) - (p[j] as number);
          sc -= e * e;
        }
        slotL[(i * 2 + k) * 10 + dg] = sc;
      }
    }
  for (let i = 0; i < 6; i++)
    for (let dg = 0; dg < 10; dg++) {
      const p = RB[dg] as number[];
      let sc = 0;
      for (let j = 0; j < 7; j++) {
        const e = at(50 + 7 * i + j) - (p[j] as number);
        sc -= e * e;
      }
      slotR[i * 10 + dg] = sc;
    }
}

function bestDigits(
  bh: Float64Array,
  rev: boolean,
): { score: number; second: number; digits: number[] } | null {
  slotScores(bh, rev);
  let best = Number.NEGATIVE_INFINITY;
  let second = Number.NEGATIVE_INFINITY;
  let bestDigits: number[] = [];
  for (let d0 = 0; d0 < 10; d0++) {
    const par = PARITY[d0] as string;
    dp.fill(Number.NEGATIVE_INFINITY);
    dp[d0] = 0;
    for (let i = 0; i < 12; i++) {
      const w = i % 2 === 0 ? 3 : 1;
      const base = i < 6 ? (i * 2 + (par[i] === "L" ? 0 : 1)) * 10 : -1;
      nd.fill(Number.NEGATIVE_INFINITY);
      for (let mod = 0; mod < 10; mod++) {
        const v0 = dp[mod] as number;
        if (v0 === Number.NEGATIVE_INFINITY) continue;
        for (let dg = 0; dg < 10; dg++) {
          const nm = (mod + dg * w) % 10;
          if (i === 11 && nm !== 0) continue;
          const v = v0 + ((i < 6 ? slotL[base + dg] : slotR[(i - 6) * 10 + dg]) as number);
          if (v > (nd[nm] as number)) {
            nd[nm] = v;
            bp[i * 10 + nm] = mod * 10 + dg;
          }
        }
      }
      dp.set(nd);
    }
    const v = dp[0] as number;
    if (v === Number.NEGATIVE_INFINITY) continue;
    if (v > best) {
      second = best;
      best = v;
      const digits = new Array<number>(13);
      digits[0] = d0;
      let mod = 0;
      for (let i = 11; i >= 0; i--) {
        const b = bp[i * 10 + mod] as number;
        digits[i + 1] = b % 10;
        mod = Math.floor(b / 10);
      }
      bestDigits = digits;
    } else if (v > second) second = v;
  }
  return best === Number.NEGATIVE_INFINITY ? null : { score: best, second, digits: bestDigits };
}

function symbolBits(digits: number[]): Float64Array {
  const par = PARITY[digits[0] as number] as string;
  let s = "101";
  for (let i = 0; i < 6; i++) s += (par[i] === "L" ? L : G)[digits[i + 1] as number] as string;
  s += "01010";
  for (let i = 0; i < 6; i++) s += R[digits[7 + i] as number] as string;
  s += "101";
  const b = new Float64Array(NM);
  for (let i = 0; i < 95; i++) b[Q + i] = s[i] === "1" ? 1 : 0;
  return b;
}

const y = new Float64Array(NS);
const bh = new Float64Array(NM);

/** Evalúa una geometría: devuelve el mejor número (en el sentido que encaje) y su ajuste. */
function evaluate(
  q: Float32Array,
  left: number,
  w: number,
  curv: number,
  sg: number,
  /** Sentido fijo (tras el grueso); sin él se prueban los dos. */
  dir?: boolean,
): { text: string; fit: number; margin: number; rev: boolean } | null {
  const n = q.length;
  for (let i = 0; i < NS; i++) {
    const m = (i + 0.5) / K - Q;
    const x = left + w * m + (curv * w * m * (m - 95)) / 95;
    if (x < 0 || x > n - 1) return null;
    const x0 = Math.floor(x);
    const f = x - x0;
    y[i] = (q[x0] as number) * (1 - f) + (q[Math.min(n - 1, x0 + 1)] as number) * f;
  }
  const { A, P, lo, hi } = solver(sg);
  for (let r = 0; r < NM; r++) {
    let s = 0;
    const o = r * NS;
    // P es prácticamente una banda (la deconvolución decae en ±8 módulos): ~7× menos operaciones
    for (let i = lo[r] as number; i < (hi[r] as number); i++)
      s += (P[o + i] as number) * (y[i] as number);
    bh[r] = s;
  }
  let best: { text: string; fit: number; margin: number; rev: boolean } | null = null;
  for (const rev of dir === undefined ? [false, true] : [dir]) {
    const r = bestDigits(bh, rev);
    if (!r) continue;
    const b = symbolBits(r.digits);
    // modelo = A·b (b en el sentido del perfil)
    let sy = 0;
    let sm = 0;
    let syy = 0;
    let smm = 0;
    let sym = 0;
    for (let i = 0; i < NS; i++) {
      let mv = 0;
      const o = i * NM;
      // solo los módulos cercanos contribuyen (σ ≤ 1,2 → ±5 módulos)
      const mc = Math.floor((i + 0.5) / K);
      for (let m = Math.max(0, mc - 5); m <= Math.min(NM - 1, mc + 5); m++)
        mv += (A[o + m] as number) * (rev ? (b[NM - 1 - m] as number) : (b[m] as number));
      const yv = y[i] as number;
      sy += yv;
      sm += mv;
      syy += yv * yv;
      smm += mv * mv;
      sym += yv * mv;
    }
    const cov = sym - (sy * sm) / NS;
    const den = Math.sqrt((syy - (sy * sy) / NS) * (smm - (sm * sm) / NS));
    const fit = den > 1e-9 ? cov / den : -1;
    const text = r.digits.join("");
    if (!best || fit > best.fit) best = { text, fit, margin: r.score - r.second, rev };
  }
  return best;
}

type Geo = {
  text: string;
  fit: number;
  margin: number;
  dl: number;
  dw: number;
  c: number;
  s: number;
  rev: boolean;
};

function search(
  q: Float32Array,
  a: number,
  w0: number,
  grid: [number, number, number, number][],
  seed: Geo | null,
): Geo | null {
  let best = seed;
  // con semilla, el sentido ya está decidido: se evalúa solo ese
  const dir = seed?.rev;
  for (const [dl, dw, c, s] of grid) {
    const r = evaluate(q, a + dl * w0, w0 * (1 + dw), c, s, dir);
    if (r && (!best || r.fit > best.fit))
      best = { text: r.text, fit: r.fit, margin: r.margin, dl, dw, c, s, rev: r.rev };
  }
  return best;
}

/**
 * Muestras del perfil por módulo por debajo de las cuales no se intenta leer (el perfil tiene 2 muestras/px):
 * 3 = 1,5 px/módulo. Con ~1 px/módulo el desenfoque hace el símbolo irresoluble y el ajuste encuentra números
 * con checksum válido y fit alto (fase 10: miniatura de 140×38 px leída como otro EAN a través de una caja IA).
 */
export const MIN_SAMPLES_PER_MODULE = 3;

/**
 * Corte del afinado en modo "full" (fase 10, latencia): un tramo cuyo mejor ajuste grueso queda por debajo no se
 * afina. Medido en la cola de public/dev: ningún ajuste aceptable (≥ 0,85) partía de un grueso < 0,785; con 0,7
 * se evita el afinado en ~50 % de los tramos.
 */
export const REFINE_GATE = 0.7;

const COARSE: [number, number, number, number][] = [];
const COARSE_FULL: [number, number, number, number][] = [];
for (const dl of [-1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2])
  for (const dw of [-0.03, 0, 0.03]) {
    COARSE.push([dl, dw, 0, 0.7]);
    for (const s of [0.45, 0.95]) COARSE_FULL.push([dl, dw, 0, s]);
  }

/**
 * Geometría de grueso a fino sobre varios tramos candidatos.
 * - "full" (fotos): grueso con σ ∈ {0,45; 0,95} y afinado (curvatura × σ, inicio × ancho) en cada tramo.
 * - "fast" (cámara): grueso con σ = 0,7 en todos y afinado reducido solo en el mejor (~95 evaluaciones).
 */
export function fitSpans(
  q: Float32Array,
  spans: readonly [number, number][],
  mode: "full" | "fast" = "full",
): EanFit | null {
  const full = mode === "full";
  const refine = (a: number, w0: number, g0: Geo): Geo => {
    const g2: [number, number, number, number][] = [];
    for (const c of full ? [-0.08, -0.04, 0, 0.04, 0.08] : [-0.06, 0, 0.06])
      for (const s of SIGMAS) g2.push([g0.dl, g0.dw, c, s]);
    const g = search(q, a, w0, g2, g0) as Geo;
    const g3: [number, number, number, number][] = [];
    for (const dl of [-0.2, -0.1, 0, 0.1, 0.2])
      for (const dw of full ? [-0.01, -0.005, 0, 0.005, 0.01] : [-0.01, 0, 0.01])
        g3.push([g.dl + dl, g.dw + dw, g.c, g.s]);
    return search(q, a, w0, g3, g) as Geo;
  };
  let best: { g: Geo; a: number; w0: number } | null = null;
  for (const [a, b] of spans) {
    const w0 = (b - a) / 95;
    if (w0 < MIN_SAMPLES_PER_MODULE) continue;
    let g = search(q, a, w0, full ? COARSE_FULL : COARSE, null);
    if (!g) continue;
    if (full && g.fit >= REFINE_GATE) g = refine(a, w0, g);
    if (!best || g.fit > best.g.fit) best = { g, a, w0 };
  }
  if (!best) return null;
  const { a, w0 } = best;
  const g = full ? best.g : refine(a, w0, best.g);
  const start = a + g.dl * w0;
  return { text: g.text, fit: g.fit, margin: g.margin, start, end: start + 95 * w0 * (1 + g.dw) };
}

/** Un solo tramo (tests). */
export function fitSpan(q: Float32Array, a: number, b: number): EanFit | null {
  return fitSpans(q, [[a, b]]);
}

/** Patrones (para tests). */
export const _test = { L, G, R, PARITY };
