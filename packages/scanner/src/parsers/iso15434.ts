import { type GS1Data, parseGS1 } from "./gs1";

// ISO/IEC 15434: "[)>" RS, sobres "NN" GS … RS, fin EOT.
const RS = "\x1e";
const GS = "\x1d";
const EOT = "\x04";

export interface ISO15434Envelope {
  /** "05" = GS1 AIs, "06" = ASC MH10 Data Identifiers, "12" = texto, etc. */
  format: string;
  /** Formato 06 (y otros con DI): elementos separados por GS. */
  elements: { di?: string; value: string }[];
  /** Solo formato 05. */
  gs1?: GS1Data;
}

export function isISO15434(text: string): boolean {
  return text.startsWith(`[)>${RS}`);
}

export function parseISO15434(text: string): ISO15434Envelope[] | null {
  if (!isISO15434(text)) return null;
  const body = text.slice(4).replace(new RegExp(`${EOT}[\\s\\S]*$`), "");
  const out: ISO15434Envelope[] = [];
  for (const env of body.split(RS)) {
    if (env.length < 2) continue;
    const format = env.slice(0, 2);
    // El formato 06/12 lleva GS tras el número; los 01/02 llevan además versión (2 dígitos).
    const rest = env.startsWith(GS, 2) ? env.slice(3) : env.slice(2);
    const parts = rest.split(GS).filter((p) => p.length > 0);
    if (format === "05") {
      out.push({
        format,
        elements: parts.map((value) => ({ value })),
        gs1: parseGS1(parts.map((x) => `${GS}${x}`).join("")),
      });
    } else if (format === "06") {
      out.push({
        format,
        elements: parts.map((p) => {
          const m = /^(\d{0,3}[A-Z])([\s\S]*)$/.exec(p);
          return m ? { di: m[1], value: m[2] as string } : { value: p };
        }),
      });
    } else out.push({ format, elements: parts.map((value) => ({ value })) });
  }
  return out;
}
