import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadEngine } from "../../src/engine/load-node";
import { decode, ScanError } from "../../src/index.node";
import type { RawImage } from "../../src/types";

const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url));
const EAN = fx("ean13-synthetic.png");
const C128 = fx("code128-synthetic.png");

async function lumaOf(png: Buffer): Promise<RawImage> {
  const r = (await loadEngine()).decodeEncoded(new Uint8Array(png));
  if (!r) throw new Error("decode");
  return { data: r.data, width: r.width, height: r.height, format: "luma" };
}

function toRgba(l: RawImage): RawImage {
  const out = new Uint8Array(l.width * l.height * 4);
  for (let i = 0; i < l.width * l.height; i++) {
    out.fill(l.data[i] ?? 0, i * 4, i * 4 + 3);
    out[i * 4 + 3] = 255;
  }
  return { data: out, width: l.width, height: l.height, format: "rgba" };
}

describe("decode() en Node", () => {
  it("lee PNG desde Buffer con todos los campos", async () => {
    const [r, ...rest] = await decode(EAN);
    expect(rest).toHaveLength(0);
    expect(r).toMatchObject({
      format: "ean_13",
      text: "5901234123457",
      symbologyIdentifier: "]E0",
      contentType: "text",
      isMirrored: false,
      isInverted: false,
    });
    expect(new TextDecoder().decode(r?.bytes)).toBe("5901234123457");
    expect(r?.cornerPoints).toHaveLength(4);
    expect(r?.boundingBox.width).toBeGreaterThan(200);
    expect(r?.confidence).toBeGreaterThan(0.5);
  });

  it("acepta ArrayBuffer, Blob, RawImage luma/rgba e ImageData-like", async () => {
    const luma = await lumaOf(C128);
    const rgba = toRgba(luma);
    const ab = C128.buffer.slice(C128.byteOffset, C128.byteOffset + C128.byteLength);
    for (const input of [
      ab,
      new Blob([C128]),
      luma,
      rgba,
      { data: rgba.data, width: rgba.width, height: rgba.height },
    ]) {
      const [r] = await decode(input as never);
      expect(r?.text).toBe("HELLO-WORLD");
    }
  });

  it("respeta formats: sin code_128 no lee el Code128", async () => {
    expect(await decode(C128, { formats: ["qr_code", "ean_13"] })).toEqual([]);
  });

  it("region en píxeles: fuera del código no lee y las coordenadas son absolutas", async () => {
    expect(await decode(EAN, { region: { x: 0, y: 0, width: 40, height: 40 } })).toEqual([]);
    const [r] = await decode(EAN, { region: { x: 30, y: 30, width: 330, height: 140 } });
    expect(r?.boundingBox.x).toBeGreaterThan(40);
  });

  it("includeErrors devuelve { results, candidates }", async () => {
    const out = await decode(EAN, { includeErrors: true });
    expect(out.results).toHaveLength(1);
    expect(Array.isArray(out.candidates)).toBe(true);
  });

  it("estrategias fast/balanced/thorough leen la imagen limpia", async () => {
    for (const strategy of ["fast", "balanced", "thorough"] as const) {
      expect((await decode(EAN, { strategy }))[0]?.text).toBe("5901234123457");
    }
  });

  it("errores tipados", async () => {
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    await expect(decode(webp)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: expect.stringMatching(/WEBP/),
    });
    await expect(decode(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(ScanError);
    await expect(decode(EAN, { formats: ["nope" as never] })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(decode(EAN, { formats: [] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(decode(EAN, { maxInputPixels: 1000 })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    const ac = new AbortController();
    ac.abort();
    await expect(decode(EAN, { signal: ac.signal })).rejects.toMatchObject({ code: "ABORTED" });
    await expect(decode({ foo: 1 } as never)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("imagen grande (> maxSide) se reduce y sigue leyendo", async () => {
    const l = await lumaOf(EAN);
    const k = 9; // 361*9 = 3249 px de ancho > 2560
    const big = new Uint8Array(l.width * k * l.height * k);
    for (let y = 0; y < l.height * k; y++)
      for (let x = 0; x < l.width * k; x++)
        big[y * l.width * k + x] = l.data[Math.floor(y / k) * l.width + Math.floor(x / k)] ?? 0;
    const [r] = await decode({
      data: big,
      width: l.width * k,
      height: l.height * k,
      format: "luma",
    });
    expect(r?.text).toBe("5901234123457");
    expect(r?.boundingBox.width).toBeGreaterThan(2000); // coordenadas en la imagen original
  });
});
