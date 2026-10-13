import { describe, expect, it } from "vitest";
import { deblurExtras, deblurFallback, proposalRegions } from "../../src/core";
import { readBlurredEan } from "../../src/deblur";
import { fitSpan, MIN_SAMPLES_PER_MODULE } from "../../src/deblur/ean";
import { locate1D, mergeRegions, quadToRegions, type Region1D } from "../../src/deblur/locate";
import type { Raster } from "../../src/engine/engine";
import { image, modules } from "../deblur-fixture";

/** Barras paralelas giradas `deg` grados (el gradiente va a lo largo de (cos, sin)). */
function stripes(deg: number, period = 12, W = 400, H = 400): Raster {
  const a = (deg * Math.PI) / 180;
  const data = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = x * Math.cos(a) + y * Math.sin(a);
      data[y * W + x] = Math.floor(t / (period / 2)) % 2 ? 40 : 220;
    }
  return { kind: "luma", data, width: W, height: H, stride: W };
}

const box = (x0: number, y0: number, x1: number, y1: number) =>
  [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ] as const;

describe("regiones del lector deblur a partir de cajas (fase 10, B8)", () => {
  it("caja casi cuadrada sobre barras giradas 30°: orientación por el tensor, no por la caja", () => {
    const rs = quadToRegions(stripes(30), box(100, 100, 300, 290));
    expect(rs).toHaveLength(1);
    const g = rs[0] as Region1D;
    // u ∥ (cos 30°, sin 30°) salvo el signo
    expect(Math.abs(g.ux * Math.cos(Math.PI / 6) + g.uy * Math.sin(Math.PI / 6))).toBeGreaterThan(
      0.98,
    );
    expect(g.cx).toBeCloseTo(200, 0);
    expect(g.cy).toBeCloseTo(195, 0);
  });

  it("sin estructura (coherencia baja): prueba los dos ejes de la caja", () => {
    const W = 200;
    const data = new Uint8Array(W * W);
    let s = 3;
    for (let i = 0; i < data.length; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (s >> 8) % 256;
    }
    const rs = quadToRegions(
      { kind: "luma", data, width: W, height: W, stride: W },
      box(20, 20, 180, 180),
    );
    expect(rs).toHaveLength(2);
    expect(Math.abs((rs[0] as Region1D).ux * (rs[1] as Region1D).ux)).toBeLessThan(0.01);
  });

  it("caja degenerada o fuera de la imagen: sin regiones", () => {
    expect(quadToRegions(stripes(0), box(10, 10, 14, 14))).toEqual([]);
    expect(quadToRegions(stripes(0), box(500, 500, 600, 600))).toEqual([]);
  });

  it("mergeRegions descarta duplicados (mismo centro y eje) y respeta el máximo", () => {
    const g = (cx: number, ux = 1): Region1D => ({
      cx,
      cy: 0,
      ux,
      uy: ux === 1 ? 0 : 1,
      u0: -50,
      u1: 50,
      v0: -10,
      v1: 10,
      score: 1,
    });
    expect(mergeRegions([[g(0)], [g(10), g(200)]], 3).map((r) => r.cx)).toEqual([0, 200]);
    // mismo centro pero el otro eje: no es duplicado
    expect(mergeRegions([[g(0), g(0, 0)]], 3)).toHaveLength(2);
    expect(mergeRegions([[g(0), g(200), g(400), g(600)]], 3)).toHaveLength(3);
  });

  it("propuestas: como mucho 3 regiones candidatas, la de mayor score primero", () => {
    const r = stripes(0);
    const props = [
      { quad: box(10, 10, 100, 60), score: 0.3 },
      { quad: box(200, 200, 380, 260), score: 0.9 },
      { quad: box(10, 300, 100, 380), score: 0.5 },
    ];
    const rs = proposalRegions(r, [...props, { quad: box(300, 10, 390, 90), score: 0.1 }]);
    expect(rs).toHaveLength(3);
    expect(rs[0]?.cx).toBeCloseTo(290, 0);
  });

  it("por debajo de 1,5 px/módulo (3 muestras del perfil) no intenta leer", () => {
    const bits = modules("7750182007269");
    const prof = (w: number) => {
      const left = 40;
      const q = new Float32Array(Math.round(2 * left + 95 * w));
      for (let x = 0; x < q.length; x++) {
        const m = Math.floor((x - left) / w);
        q[x] = m >= 0 && m < 95 && bits[m] === "1" ? 1 : 0;
      }
      return [q, left, left + 95 * w] as const;
    };
    const [ok, a, b] = prof(3.2);
    expect(fitSpan(ok, a, b)?.text).toBe("7750182007269");
    const [low, c, d] = prof(2.5);
    expect(fitSpan(low, c, d)).toBeNull();
    expect(MIN_SAMPLES_PER_MODULE).toBe(3);
  });

  it("deblurFallback lee un EAN desenfocado a partir de una caja ajustada (sin depender del tensor global)", () => {
    const r = image("7501033204265", 4, 0.6, 12, 0);
    const extra = quadToRegions(r, box(160, 578, 560, 702));
    const out = deblurFallback(r, [], {}, extra);
    expect(out.map((x) => x.text)).toContain("7501033204265");
  });

  it("advanced.deblurProposals: las cajas de plugins solo llegan al lector con la opción (default: no)", () => {
    const r = stripes(0);
    const props = [{ quad: box(200, 200, 380, 260), score: 0.9 }];
    expect(deblurExtras(r, props, {})).toEqual([]);
    expect(deblurExtras(r, props, { advanced: { deblurProposals: false } })).toEqual([]);
    expect(deblurExtras(r, props, { advanced: { deblurProposals: true } })).toHaveLength(1);
  });
});

describe("cortes de trabajo del lector deblur (fase 10, latencia)", () => {
  it("mismo resultado con y sin corte de región en un EAN desenfocado", () => {
    const r = image("7501033204265", 4, 0.6, 12, 6);
    const regs = locate1D(r, 2);
    expect(readBlurredEan(r, { regions: regs }).map((x) => x.text)).toEqual(
      readBlurredEan(r, { regions: regs, gateLines: 0 }).map((x) => x.text),
    );
  });
});
