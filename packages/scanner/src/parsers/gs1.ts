import { AIS, type AiSpec } from "./gs1-ais";

const GS = "\x1d";

export interface GS1Element {
  ai: string;
  title: string;
  value: string;
}

export interface GS1Data {
  elements: GS1Element[];
  /** AI → valor (si un AI se repite gana el primero). */
  ais: Record<string, string>;
  gtin?: string;
  sscc?: string;
  batch?: string;
  serial?: string;
  /** Fechas ISO (YYYY-MM-DD). Día "00" = último día del mes (GS1 7.12). */
  expiry?: string;
  bestBefore?: string;
  productionDate?: string;
  /** Peso neto en kg (AI 310n con sus decimales implícitos). */
  netWeightKg?: number;
  count?: number;
  /** Problemas no fatales: AI desconocido, longitud o dígito de control incorrectos. */
  errors: string[];
}

/** Dígito de control GS1 (mod 10) sobre los dígitos sin el último. */
export function gs1CheckDigit(digits: string): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const d = digits.charCodeAt(digits.length - 1 - i) - 48;
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10;
}

function date(yymmdd: string, now = new Date()): string | undefined {
  if (!/^\d{6}$/.test(yymmdd)) return undefined;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  let dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12) return undefined;
  // Siglo según GS1 GenSpecs 7.12: ventana de −49/+50 años respecto del año actual.
  const cur = now.getUTCFullYear();
  const diff = yy - (cur % 100);
  const century = Math.floor(cur / 100) + (diff >= 51 ? -1 : diff <= -50 ? 1 : 0);
  const year = century * 100 + yy;
  if (dd === 0) dd = new Date(Date.UTC(year, mm, 0)).getUTCDate();
  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function lookup(s: string, i: number): [string, AiSpec] | null {
  for (const len of [2, 3, 4]) {
    const ai = s.slice(i, i + len);
    const spec = AIS.get(ai);
    if (spec) return [ai, spec];
  }
  return null;
}

/**
 * Parsea un element string GS1: con paréntesis "(01)…(17)…", con FNC1 (\x1d, como lo devuelve `text`
 * en modo "plain") y con los identificadores de simbología "]C1", "]d2", "]Q3", "]e0".
 */
export function parseGS1(input: string): GS1Data {
  const out: GS1Data = { elements: [], ais: {}, errors: [] };
  let s = input.replace(/^\][A-Za-z]\d/, "");
  const pairs: [string, string][] = [];
  if (s.startsWith("(")) {
    for (const m of s.matchAll(/\((\d{2,4})\)([^(]*)/g))
      pairs.push([m[1] as string, (m[2] as string).replaceAll(GS, "")]);
  } else {
    while (s.startsWith(GS)) s = s.slice(1);
    let i = 0;
    while (i < s.length) {
      if (s[i] === GS) {
        i++;
        continue;
      }
      const hit = lookup(s, i);
      if (!hit) {
        out.errors.push(`AI desconocido en la posición ${i}: "${s.slice(i, i + 4)}"`);
        break;
      }
      const [ai, spec] = hit;
      i += ai.length;
      let end: number;
      if (spec.min === spec.max) end = i + spec.max;
      else {
        const gs = s.indexOf(GS, i);
        end = gs === -1 ? s.length : gs;
        if (end - i > spec.max) end = i + spec.max;
      }
      pairs.push([ai, s.slice(i, end)]);
      i = end;
    }
  }
  for (const [ai, value] of pairs) {
    const spec = AIS.get(ai);
    if (!spec) {
      out.errors.push(`AI desconocido: (${ai})`);
      continue;
    }
    if (value.length < spec.min || value.length > spec.max)
      out.errors.push(`(${ai}) longitud ${value.length}, esperado ${spec.min}..${spec.max}`);
    if (spec.numeric && !/^\d*$/.test(value)) out.errors.push(`(${ai}) debe ser numérico`);
    out.elements.push({ ai, title: spec.title, value });
    if (!(ai in out.ais)) out.ais[ai] = value;
  }
  const a = out.ais;
  for (const [ai, n] of [
    ["01", 14],
    ["00", 18],
  ] as const) {
    const v = a[ai];
    if (v?.length === n && /^\d+$/.test(v) && gs1CheckDigit(v.slice(0, -1)) !== Number(v.at(-1)))
      out.errors.push(`(${ai}) dígito de control incorrecto`);
  }
  if (a["01"]) out.gtin = a["01"];
  if (a["00"]) out.sscc = a["00"];
  if (a["10"]) out.batch = a["10"];
  if (a["21"]) out.serial = a["21"];
  if (a["17"]) out.expiry = date(a["17"]);
  if (a["15"]) out.bestBefore = date(a["15"]);
  if (a["11"]) out.productionDate = date(a["11"]);
  const w = Object.keys(a).find((k) => k.startsWith("310"));
  if (w) out.netWeightKg = Number(a[w]) / 10 ** Number(w[3]);
  if (a["37"]) out.count = Number(a["37"]);
  return out;
}
