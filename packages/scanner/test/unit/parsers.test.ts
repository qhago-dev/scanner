import { describe, expect, it } from "vitest";
import {
  gs1CheckDigit,
  parseAAMVA,
  parseGS1,
  parseISO15434,
  parseQRContent,
} from "../../src/parsers";

const GS = "\x1d";

describe("parseGS1", () => {
  it("paréntesis (ejemplo del diseño)", () => {
    const r = parseGS1("(01)07501031311309(17)261231(10)LOTE1");
    expect(r.gtin).toBe("07501031311309");
    expect(r.expiry).toBe("2026-12-31");
    expect(r.batch).toBe("LOTE1");
    expect(r.ais).toEqual({ "01": "07501031311309", "17": "261231", "10": "LOTE1" });
  });

  it("FNC1 crudo + identificador ]C1 (GenSpecs 2.1: GTIN + peso neto + lote + serie)", () => {
    const r = parseGS1(`]C10109521234543213310300018910ABC123${GS}21XYZ`);
    expect(r.gtin).toBe("09521234543213");
    expect(r.netWeightKg).toBeCloseTo(0.189);
    expect(r.batch).toBe("ABC123");
    expect(r.serial).toBe("XYZ");
    expect(r.errors).toEqual([]);
  });

  it("día 00 = último día del mes y SSCC", () => {
    const r = parseGS1(`00106141411234567897${GS}15280200`);
    expect(r.sscc).toBe("106141411234567897");
    expect(r.bestBefore).toBe("2028-02-29");
    expect(r.errors).toEqual([]);
  });

  it("detecta dígito de control y longitudes erróneas", () => {
    const r = parseGS1("(01)09521234543214(17)2612");
    expect(r.errors.join(" ")).toMatch(/control/);
    expect(r.errors.join(" ")).toMatch(/\(17\) longitud/);
  });

  it("gs1CheckDigit", () => {
    expect(gs1CheckDigit("0952123454321")).toBe(3);
    expect(gs1CheckDigit("10614141123456789")).toBe(7);
  });
});

describe("parseQRContent", () => {
  it.each([
    ["https://qhago.dev/x?y=1", { type: "url", url: "https://qhago.dev/x?y=1" }],
    [
      "WIFI:T:WPA;S:Casa;P:clave;;",
      { type: "wifi", ssid: "Casa", password: "clave", security: "WPA", hidden: false },
    ],
    [
      String.raw`WIFI:S:a\;b;T:nopass;H:true;;`,
      { type: "wifi", ssid: "a;b", password: undefined, security: "nopass", hidden: true },
    ],
    [
      "geo:-12.0464,-77.0428?q=Lima",
      { type: "geo", lat: -12.0464, lon: -77.0428, alt: undefined, query: "Lima" },
    ],
    ["tel:+51999888777", { type: "tel", number: "+51999888777" }],
    [
      "mailto:a@b.pe?subject=Hola%20mundo&body=x",
      { type: "email", to: "a@b.pe", subject: "Hola mundo", body: "x", cc: undefined },
    ],
    ["SMSTO:+51999:hola", { type: "sms", number: "+51999", body: "hola" }],
    ["sms:+51999?body=hola", { type: "sms", number: "+51999", body: "hola" }],
    ["solo texto", { type: "text", text: "solo texto" }],
  ])("%s", (input, expected) => {
    expect(parseQRContent(input)).toEqual(expected);
  });

  it("vCard 3.0", () => {
    const r = parseQRContent(
      "BEGIN:VCARD\r\nVERSION:3.0\r\nN:Pérez;Ana;;;\r\nFN:Ana Pérez\r\nORG:Qhago\r\nTEL;TYPE=CELL:+51 999\r\nEMAIL:ana@qhago.dev\r\nADR:;;Av. Sol 1;Cusco;;08000;PE\r\nEND:VCARD",
    );
    expect(r).toMatchObject({
      type: "vcard",
      name: "Ana Pérez",
      org: "Qhago",
      phones: ["+51 999"],
      emails: ["ana@qhago.dev"],
      address: "Av. Sol 1, Cusco, 08000, PE",
    });
  });

  it("MeCard", () => {
    expect(parseQRContent("MECARD:N:Pérez,Ana;TEL:999;EMAIL:a@b.pe;;")).toMatchObject({
      type: "mecard",
      name: "Ana Pérez",
      phones: ["999"],
      emails: ["a@b.pe"],
    });
  });
});

/** Construye un PDF417 AAMVA con offsets correctos (estándar 2020, anexo D). */
function aamva(fields: Record<string, string>, version = 10): string {
  const body = `DL${Object.entries(fields)
    .map(([k, v]) => `${k}${v}\n`)
    .join("")}\r`;
  const header = `@\n\x1e\rANSI 636014${String(version).padStart(2, "0")}0001`;
  const offset = header.length + 10;
  return `${header}DL${String(offset).padStart(4, "0")}${String(body.length).padStart(4, "0")}${body}`;
}

describe("parseAAMVA", () => {
  it("licencia de EE. UU. (fechas MMDDCCYY)", () => {
    const r = parseAAMVA(
      aamva({
        DAQ: "D1234567",
        DCS: "PUBLIC",
        DAC: "JOHN",
        DAD: "Q",
        DBB: "01311990",
        DBA: "06302030",
        DBC: "1",
        DAG: "123 MAIN ST",
        DAI: "SACRAMENTO",
        DAJ: "CA",
        DAK: "958140000",
        DCG: "USA",
      }),
    );
    expect(r).toMatchObject({
      iin: "636014",
      version: 10,
      documentNumber: "D1234567",
      lastName: "PUBLIC",
      firstName: "JOHN",
      middleName: "Q",
      dateOfBirth: "1990-01-31",
      expiry: "2030-06-30",
      sex: "M",
      city: "SACRAMENTO",
      state: "CA",
      postalCode: "95814",
      country: "USA",
    });
  });

  it("Canadá (CCYYMMDD) y offsets mal calculados", () => {
    const t = aamva({
      DAQ: "X1",
      DCS: "ROY",
      DAC: "MARIE",
      DBB: "19851224",
      DBC: "2",
      DCG: "CAN",
    }).replace(/DL\d{4}/, "DL0003");
    expect(parseAAMVA(t)).toMatchObject({ lastName: "ROY", dateOfBirth: "1985-12-24", sex: "F" });
  });

  it("devuelve null si no es AAMVA", () => {
    expect(parseAAMVA("hola")).toBeNull();
  });
});

describe("parseISO15434", () => {
  it("formato 06 con Data Identifiers y formato 05 GS1", () => {
    const t = `[)>\x1e06${GS}1PABC-123${GS}Q10${GS}25SUN0001${GS}\x1e05${GS}0109521234543213${GS}10L1\x1e\x04`;
    const r = parseISO15434(t);
    expect(r?.[0]).toEqual({
      format: "06",
      elements: [
        { di: "1P", value: "ABC-123" },
        { di: "Q", value: "10" },
        { di: "25S", value: "UN0001" },
      ],
    });
    expect(r?.[1]?.gs1?.gtin).toBe("09521234543213");
    expect(r?.[1]?.gs1?.batch).toBe("L1");
  });
  it("null si no hay cabecera", () => expect(parseISO15434("x")).toBeNull());
});
