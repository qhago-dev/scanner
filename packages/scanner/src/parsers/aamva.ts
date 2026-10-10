// AAMVA DL/ID Card Design Standard (2020), anexo D: PDF417 de licencias de conducir de EE. UU./Canadá.

export interface AAMVAData {
  /** Issuer Identification Number (6 dígitos). */
  iin: string;
  version: number;
  jurisdictionVersion: number;
  /** Subarchivos por tipo ("DL", "ID", "Z?"): código de 3 letras → valor. */
  subfiles: Record<string, Record<string, string>>;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  /** Fechas ISO (YYYY-MM-DD). */
  dateOfBirth?: string;
  expiry?: string;
  issueDate?: string;
  sex?: "M" | "F" | "X";
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  documentNumber?: string;
}

function isoDate(v: string | undefined, country: string | undefined): string | undefined {
  if (!v || !/^\d{8}$/.test(v)) return undefined;
  // EE. UU.: MMDDCCYY; Canadá: CCYYMMDD (D.12.5.1). Si el país no consta, se infiere por el rango.
  const ymd = country === "CAN" || (country !== "USA" && Number(v.slice(0, 2)) > 12);
  const [y, m, d] = ymd
    ? [v.slice(0, 4), v.slice(4, 6), v.slice(6, 8)]
    : [v.slice(4, 8), v.slice(0, 2), v.slice(2, 4)];
  return `${y}-${m}-${d}`;
}

/** true si el texto parece un PDF417 AAMVA (cabecera "@\n\x1e\r" + "ANSI " / "AAMVA"). */
export function isAAMVA(text: string): boolean {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: separadores AAMVA (RS)
  return /^@\s*\n?\x1e?\r?\s*(ANSI |AAMVA)\d{6}/.test(text);
}

export function parseAAMVA(text: string): AAMVAData | null {
  const head = /ANSI |AAMVA/.exec(text);
  if (!head || head.index > 8) return null;
  let p = head.index + head[0].length;
  const num = (n: number) => {
    const v = text.slice(p, p + n);
    p += n;
    return /^\d+$/.test(v) ? Number(v) : Number.NaN;
  };
  const iin = text.slice(p, p + 6);
  p += 6;
  const version = num(2);
  // La versión 01 no lleva versión de jurisdicción.
  const jurisdictionVersion = version >= 2 ? num(2) : 0;
  const entries = num(2);
  if (!/^\d{6}$/.test(iin) || Number.isNaN(version + jurisdictionVersion + entries)) return null;
  const subfiles: Record<string, Record<string, string>> = {};
  for (let k = 0; k < entries && p + 10 <= text.length; k++, p += 10) {
    const type = text.slice(p, p + 2);
    const offset = Number(text.slice(p + 2, p + 6));
    const length = Number(text.slice(p + 6, p + 10));
    if (!/^[A-Z]{2}$/.test(type)) break;
    let body = text.slice(offset, offset + length);
    // Muchos emisores calculan mal los offsets: si no cuadra, se busca el tipo tras la cabecera.
    if (!body.startsWith(type)) {
      const at = text.indexOf(type, p + 10 * (entries - k));
      body = at === -1 ? "" : text.slice(at, at + length);
    }
    const fields: Record<string, string> = {};
    for (const line of body.slice(2).split(/[\n\r]+/)) {
      const code = line.slice(0, 3);
      if (/^[A-Z]{3}$/.test(code)) fields[code] = line.slice(3).trim();
    }
    subfiles[type] = fields;
  }
  const f = subfiles.DL ?? subfiles.ID ?? {};
  const country = f.DCG;
  let [lastName, firstName, middleName] = [f.DCS, f.DAC ?? f.DCT, f.DAD];
  if (!lastName && f.DAA) [lastName, firstName, middleName] = f.DAA.split(/[,$]/);
  const sex = ({ "1": "M", "2": "F", "9": "X", M: "M", F: "F", X: "X" } as const)[f.DBC as "1"];
  return {
    iin,
    version,
    jurisdictionVersion,
    subfiles,
    firstName,
    middleName,
    lastName,
    dateOfBirth: isoDate(f.DBB, country),
    expiry: isoDate(f.DBA, country),
    issueDate: isoDate(f.DBD, country),
    sex,
    street: f.DAG,
    city: f.DAI,
    state: f.DAJ,
    postalCode: f.DAK?.replace(/0000$/, "").trim(),
    country,
    documentNumber: f.DAQ,
  };
}
