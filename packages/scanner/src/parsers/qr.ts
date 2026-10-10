// Contenidos estructurados habituales en QR (convenciones de facto: ZXing "barcode contents", vCard 3/4, MeCard).

export type QRContent =
  | { type: "url"; url: string }
  | {
      type: "wifi";
      ssid: string;
      password?: string;
      security: "WPA" | "WEP" | "nopass" | string;
      hidden: boolean;
    }
  | {
      type: "vcard";
      name?: string;
      org?: string;
      title?: string;
      phones: string[];
      emails: string[];
      urls: string[];
      address?: string;
      note?: string;
      fields: Record<string, string[]>;
    }
  | {
      type: "mecard";
      name?: string;
      phones: string[];
      emails: string[];
      urls: string[];
      address?: string;
      note?: string;
    }
  | { type: "geo"; lat: number; lon: number; alt?: number; query?: string }
  | { type: "tel"; number: string }
  | { type: "email"; to: string; subject?: string; body?: string; cc?: string }
  | { type: "sms"; number: string; body?: string }
  | { type: "text"; text: string };

/** Separa por `sep` respetando el escape "\" de WIFI/MeCard. */
function splitEscaped(s: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i] as string;
    if (c === "\\" && i + 1 < s.length) cur += s[++i];
    else if (c === sep) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

function kv(body: string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const part of splitEscaped(body, ";")) {
    const i = part.indexOf(":");
    if (i <= 0) continue;
    const k = part.slice(0, i).toUpperCase();
    m.set(k, [...(m.get(k) ?? []), part.slice(i + 1)]);
  }
  return m;
}

const dec = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

function query(q: string): Record<string, string> {
  const o: Record<string, string> = {};
  for (const p of q.split("&")) {
    const [k, v = ""] = p.split("=");
    if (k) o[k.toLowerCase()] = dec(v);
  }
  return o;
}

function vcard(text: string): QRContent {
  // Desdoblado de líneas (RFC 6350 3.2).
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const fields: Record<string, string[]> = {};
  for (const l of lines) {
    const i = l.indexOf(":");
    if (i <= 0) continue;
    const key = (l.slice(0, i).split(";")[0] as string).toUpperCase().replace(/^item\d+\./i, "");
    const list = fields[key] ?? [];
    fields[key] = list;
    list.push(
      l
        .slice(i + 1)
        .replace(/\\([,;\\])/g, "$1")
        .replace(/\\n/gi, "\n"),
    );
  }
  const n = fields.N?.[0]?.split(";");
  return {
    type: "vcard",
    name: fields.FN?.[0] ?? (n ? [n[1], n[2], n[0]].filter(Boolean).join(" ") : undefined),
    org: fields.ORG?.[0]?.replace(/;/g, " ").trim(),
    title: fields.TITLE?.[0],
    phones: fields.TEL ?? [],
    emails: fields.EMAIL ?? [],
    urls: fields.URL ?? [],
    address: fields.ADR?.[0]?.split(";").filter(Boolean).join(", "),
    note: fields.NOTE?.[0],
    fields,
  };
}

/** Clasifica y parsea el texto de un QR. Lo no reconocido vuelve como `{ type: "text" }`. */
export function parseQRContent(text: string): QRContent {
  const t = text.trim();
  const up = t.toUpperCase();
  if (/^https?:\/\/\S+$/i.test(t)) return { type: "url", url: t };
  if (up.startsWith("WIFI:")) {
    const m = kv(t.slice(5));
    return {
      type: "wifi",
      ssid: m.get("S")?.[0] ?? "",
      password: m.get("P")?.[0],
      security: m.get("T")?.[0] || "nopass",
      hidden: m.get("H")?.[0]?.toLowerCase() === "true",
    };
  }
  if (up.startsWith("BEGIN:VCARD")) return vcard(t);
  if (up.startsWith("MECARD:")) {
    const m = kv(t.slice(7));
    const name = m.get("N")?.[0];
    return {
      type: "mecard",
      name: name?.includes(",") ? name.split(",").reverse().join(" ").trim() : name,
      phones: m.get("TEL") ?? [],
      emails: m.get("EMAIL") ?? [],
      urls: m.get("URL") ?? [],
      address: m.get("ADR")?.[0],
      note: m.get("NOTE")?.[0],
    };
  }
  const geo = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(-?\d+(?:\.\d+)?))?(?:[;?](.*))?$/i.exec(
    t,
  );
  if (geo) {
    const q = geo[4] ? query(geo[4].replace(/^[^?]*\?/, "")).q : undefined;
    return {
      type: "geo",
      lat: Number(geo[1]),
      lon: Number(geo[2]),
      alt: geo[3] ? Number(geo[3]) : undefined,
      query: q,
    };
  }
  if (/^tel:/i.test(t)) return { type: "tel", number: dec(t.slice(4)) };
  if (/^mailto:/i.test(t)) {
    const [to = "", q = ""] = t.slice(7).split("?");
    const p = query(q);
    return { type: "email", to: dec(to), subject: p.subject, body: p.body, cc: p.cc };
  }
  if (up.startsWith("MATMSG:")) {
    const m = kv(t.slice(7));
    return {
      type: "email",
      to: m.get("TO")?.[0] ?? "",
      subject: m.get("SUB")?.[0],
      body: m.get("BODY")?.[0],
    };
  }
  const smsto = /^smsto:([^:]*)(?::([\s\S]*))?$/i.exec(t);
  if (smsto) return { type: "sms", number: smsto[1] as string, body: smsto[2] };
  if (/^sms:/i.test(t)) {
    const [num = "", q = ""] = t.slice(4).split("?");
    return { type: "sms", number: dec(num), body: query(q).body };
  }
  return { type: "text", text };
}
