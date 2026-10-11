// Tramo del símbolo en un perfil normalizado (barras ≈ 1, fondo ≈ 0): entre dos zonas blancas, con un número
// de picos compatible con un EAN-13 (30 barras; los picos dobles de barras anchas desenfocadas suman algunos).

export function normalize(prof: Float32Array): Float32Array | null {
  let mx = -Infinity;
  for (const v of prof) mx = Math.max(mx, v);
  const q = new Float32Array(prof.length);
  for (let i = 0; i < prof.length; i++) q[i] = mx - (prof[i] as number);
  const s = Float32Array.from(q).sort();
  const lo = s[Math.floor(0.03 * s.length)] as number;
  const hi = s[Math.floor(0.97 * s.length)] as number;
  if (hi - lo < 12) return null;
  for (let i = 0; i < q.length; i++)
    q[i] = Math.max(-0.2, Math.min(1.2, ((q[i] as number) - lo) / (hi - lo)));
  return q;
}

export function countPeaks(q: Float32Array, a: number, b: number): number {
  let n = 0;
  let lastMin = Infinity;
  let up = false;
  let peak = -Infinity;
  for (let i = a + 1; i < b; i++) {
    const v = q[i] as number;
    const p = q[i - 1] as number;
    if (v > p) {
      up = true;
      peak = Math.max(peak, v);
    } else if (up && v < p) {
      if (peak > 0.3 && peak - lastMin > 0.12) {
        n++;
        lastMin = Infinity;
      }
      up = false;
      peak = -Infinity;
    }
    lastMin = Math.min(lastMin, v);
  }
  return n;
}

/** Hasta `top` tramos candidatos [a, b), primero los de zonas de silencio más largas. */
export function findSpans(q: Float32Array, top = 3, minQuiet = 2): [number, number][] {
  // Los bordes del perfil cuentan como zona blanca solo si el perfil no empieza/acaba ya en blanco (si
  // no, el tramo "desde el borde" incluiría esa zona blanca como parte del símbolo).
  const runs: [number, number][] = (q[0] as number) < 0.3 ? [] : [[-1e6, 0]];
  let s = -1;
  for (let i = 0; i <= q.length; i++) {
    const white = i < q.length && (q[i] as number) < 0.3;
    if (white && s < 0) s = i;
    else if (!white && s >= 0) {
      runs.push([s, i]);
      s = -1;
    }
  }
  if ((q[q.length - 1] as number) >= 0.3) runs.push([q.length, 1e6]);
  const cands: { quiet: number; dp: number; a: number; b: number }[] = [];
  for (let i = 0; i < runs.length; i++)
    for (let j = i + 1; j < runs.length; j++) {
      const a = (runs[i] as [number, number])[1];
      const b = (runs[j] as [number, number])[0];
      const L = b - a;
      if (L < 95 * 1.2) continue;
      const mod = L / 95;
      const qa = (runs[i] as [number, number])[1] - (runs[i] as [number, number])[0];
      const qb = (runs[j] as [number, number])[1] - (runs[j] as [number, number])[0];
      if (qa < minQuiet * mod || qb < minQuiet * mod) continue;
      const n = countPeaks(q, a, b);
      if (n >= 24 && n <= 40)
        cands.push({ quiet: Math.min(Math.min(qa, qb) / mod, 8), dp: Math.abs(n - 30), a, b });
    }
  cands.sort((x, y) => y.quiet - x.quiet || x.dp - y.dp || y.b - y.a - (x.b - x.a));
  return cands.slice(0, top).map((c) => [c.a, c.b]);
}
