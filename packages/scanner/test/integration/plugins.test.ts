// F5.5 (sa_read_quad) y F5.6 (plugins) con el motor de Node.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { decodeInline, type Platform, readRaster } from "../../src/core";
import type { Engine, Raster } from "../../src/engine/engine";
import { loadEngine } from "../../src/engine/load-node";
import { encodeOptions } from "../../src/engine/options";
import { isScanError } from "../../src/errors";
import { toRaster } from "../../src/input/node";
import { PluginRegistry, rectifyTarget, type ScannerPlugin } from "../../src/plugins";
import type { BarcodeResult, Point } from "../../src/types";
import { imagesIn, samplesAvailable } from "../samples";

const FIX = join(import.meta.dirname, "../fixtures");
const platform: Platform = { loadEngine, toRaster };
let engine: Engine;
let ean: Raster;
let eanRead: BarcodeResult;

beforeAll(async () => {
  engine = await loadEngine();
  ean = await toRaster(new Uint8Array(await readFile(join(FIX, "ean13-synthetic.png"))), engine);
  eanRead = readRaster(engine, ean, { formats: ["ean_13"] }).results[0] as BarcodeResult;
});

const near = (a: Point[], b: Point[], tol: number) =>
  a.every((p, i) => Math.hypot(p.x - (b[i] as Point).x, p.y - (b[i] as Point).y) < tol);

describe("readQuad (sa_read_quad)", () => {
  it("rectifica el cuadrilátero y devuelve puntos en coordenadas del origen", () => {
    expect(eanRead.text).toBe("5901234123457");
    const t = rectifyTarget(eanRead.cornerPoints, true);
    const out = engine.readQuad(
      ean,
      t.quad,
      t.width,
      t.height,
      encodeOptions({ formats: ["ean_13"] }),
    );
    expect(out.results[0]?.text).toBe("5901234123457");
    // En 1D las esquinas son las líneas de escaneo que leyeron: x coincide; y queda dentro del código.
    const got = out.results[0]?.cornerPoints ?? [];
    const xs = (c: Point[]) => c.map((p) => ({ x: p.x, y: 0 }));
    expect(near(xs(got), xs(eanRead.cornerPoints), 4)).toBe(true);
    const ys = eanRead.cornerPoints.map((p) => p.y);
    for (const p of got) expect(p.y).toBeGreaterThan(Math.min(...ys) - 60);
  });

  it("lee con el cuadrilátero rotado (orden cíclico distinto) y desde RGBA", () => {
    const [a, b, c, d] = rectifyTarget(eanRead.cornerPoints, true).quad;
    const rgba = new Uint8Array(ean.width * ean.height * 4);
    for (let i = 0; i < ean.width * ean.height; i++) {
      rgba.fill(ean.data[i] as number, i * 4, i * 4 + 3);
      rgba[i * 4 + 3] = 255;
    }
    const r: Raster = {
      kind: "rgba",
      data: rgba,
      width: ean.width,
      height: ean.height,
      stride: ean.width * 4,
    };
    const out = engine.readQuad(r, [b, c, d, a], 160, 480, encodeOptions({ formats: ["ean_13"] }));
    expect(out.results[0]?.text).toBe("5901234123457");
  });

  it("un cuadrilátero fuera de la imagen no lee y no rompe", () => {
    const q: Point[] = [
      { x: -500, y: -500 },
      { x: -400, y: -500 },
      { x: -400, y: -400 },
      { x: -500, y: -400 },
    ];
    expect(engine.readQuad(ean, q, 256, 256, encodeOptions({})).results).toEqual([]);
  });
});

function fakePlugin(when: "fallback" | "always", calls: { n: number }): ScannerPlugin {
  return {
    name: "fake",
    when,
    async onFrame() {
      calls.n++;
      return [{ quad: eanRead.cornerPoints, formats: ["ean_13"], score: 0.9 }];
    },
  };
}

describe("plugins en decode()", () => {
  const input = () => readFile(join(FIX, "ean13-synthetic.png")).then((b) => new Uint8Array(b));
  const plugins = [{ name: "fake", apiVersion: 1 as const, options: { when: "always" } }];

  it("UNSUPPORTED si el worker no registra el plugin", async () => {
    const e = await decodeInline(platform, await input(), { plugins }).catch((x) => x);
    expect(isScanError(e) && e.code).toBe("UNSUPPORTED");
    expect(String(e.message)).toMatch(/aiWorker/);
  });

  it('"fallback" no llama al plugin si la cascada ya lee', async () => {
    const calls = { n: 0 };
    const reg = new PluginRegistry({ fake: () => fakePlugin("fallback", calls) });
    const r = (await decodeInline(
      platform,
      await input(),
      { plugins, formats: ["ean_13"] },
      reg,
    )) as BarcodeResult[];
    expect(r).toHaveLength(1);
    expect(calls.n).toBe(0);
  });

  it('"always" llama al plugin, sin duplicar resultados, y la instancia se reutiliza', async () => {
    const calls = { n: 0 };
    let created = 0;
    const reg = new PluginRegistry({
      fake: () => {
        created++;
        return fakePlugin("always", calls);
      },
    });
    for (let i = 0; i < 2; i++) {
      const r = (await decodeInline(
        platform,
        await input(),
        { plugins, formats: ["ean_13"] },
        reg,
      )) as BarcodeResult[];
      expect(r.map((x) => x.text)).toEqual(["5901234123457"]);
    }
    expect(calls.n).toBe(2);
    expect(created).toBe(1);
  });

  it("apiVersion distinta → UNSUPPORTED", async () => {
    const reg = new PluginRegistry({ fake: () => fakePlugin("always", { n: 0 }) });
    const e = await decodeInline(
      platform,
      await input(),
      { plugins: [{ name: "fake", apiVersion: 2 as never }] },
      reg,
    ).catch((x) => x);
    expect(isScanError(e) && e.code).toBe("UNSUPPORTED");
  });
});

describe.skipIf(!samplesAvailable)("readQuad en 2D (samples upstream)", () => {
  it("QR: las esquinas devueltas coinciden con las de la lectura directa", async () => {
    let checked = 0;
    for (const s of imagesIn("qrcode-2").slice(0, 12)) {
      const r = await toRaster(new Uint8Array(await readFile(s.file)), engine);
      const direct = readRaster(engine, r, { formats: ["qr_code"] }).results[0];
      if (!direct) continue;
      const t = rectifyTarget(direct.cornerPoints, false);
      const out = engine.readQuad(
        r,
        t.quad,
        t.width,
        t.height,
        encodeOptions({ formats: ["qr_code"] }),
      );
      expect(out.results[0]?.text).toBe(direct.text);
      const side = Math.hypot(
        direct.cornerPoints[1].x - direct.cornerPoints[0].x,
        direct.cornerPoints[1].y - direct.cornerPoints[0].y,
      );
      // Mismo cuadrilátero salvo rotación cíclica (el warp puede girar el símbolo).
      const got = out.results[0]?.cornerPoints ?? [];
      const ok = [0, 1, 2, 3].some((k) =>
        near(
          got.map((_, i) => got[(i + k) % 4] as Point),
          direct.cornerPoints,
          side * 0.05 + 2,
        ),
      );
      expect(ok).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(3);
  });
});
