import { describe, expect, it } from "vitest";
import { contentKey, Fusion, framesNeeded } from "../../src/scanner/fusion";
import { iou, type Observation, Tracker, trackingBox } from "../../src/scanner/tracker";
import type { Point } from "../../src/types";

const quad = (x: number, y: number, w: number, h: number): [Point, Point, Point, Point] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const obs = (
  x: number,
  y: number,
  w = 100,
  h = 100,
  key: string | null = "k",
  format: Observation["format"] = "qr_code",
): Observation => ({
  format,
  corners: quad(x, y, w, h),
  key,
});

describe("tracker", () => {
  it("expande cajas 1D degeneradas (línea) para que IoU funcione", () => {
    const b = trackingBox(quad(0, 50, 200, 2));
    expect(b.height).toBeCloseTo(60);
    expect(iou(trackingBox(quad(0, 50, 200, 2)), trackingBox(quad(4, 54, 200, 2)))).toBeGreaterThan(
      0.5,
    );
  });

  it("mantiene el trackId con movimiento pequeño y crea otro para un segundo código", () => {
    const t = new Tracker();
    const [a] = t.update([obs(0, 0)], 0).assigned;
    const r = t.update([obs(10, 5), obs(400, 0)], 33).assigned;
    expect(r[0]?.id).toBe(a?.id);
    expect(r[1]?.id).not.toBe(a?.id);
  });

  it("mismo contenido sin solape ni cercanía = otro objeto", () => {
    const t = new Tracker();
    const [a] = t.update([obs(0, 0)], 0).assigned;
    const [b] = t.update([obs(600, 600)], 33).assigned;
    expect(b?.id).not.toBe(a?.id);
  });

  it("expira tracks y cuenta fallos de los unread", () => {
    const t = new Tracker(500);
    t.update([obs(0, 0, 100, 100, null)], 0);
    t.update([obs(2, 2, 100, 100, null)], 30);
    t.update([obs(3, 3, 100, 100, null)], 60);
    expect(t.escalations()).toHaveLength(1);
    const { lost } = t.update([], 700);
    expect(lost).toHaveLength(1);
    expect(t.all()).toHaveLength(0);
  });

  it("un unread que luego se lee pasa a read", () => {
    const t = new Tracker();
    t.update([obs(0, 0, 100, 100, null)], 0);
    const [tr] = t.update([obs(1, 1, 100, 100, "abc")], 30).assigned;
    expect(tr?.kind).toBe("read");
    expect(t.escalations()).toHaveLength(0);
  });
});

describe("fusión", () => {
  const opt = { confirmFrames: "auto" as const, windowMs: 1500, duplicateCooldownMs: 2000 };

  it("regla ADR-05", () => {
    expect(framesNeeded("ean_13", "123", "auto")).toBe(1);
    expect(framesNeeded("code_39", "ABC", "auto")).toBe(2);
    expect(framesNeeded("code_128", "AB12", "auto")).toBe(2);
    expect(framesNeeded("code_128", "ABCDEF", "auto")).toBe(1);
    expect(framesNeeded("qr_code", "x", 3)).toBe(3);
  });

  it("confirma Code39 en el segundo frame y deduplica con cooldown", () => {
    const f = new Fusion(opt);
    const k = contentKey("code_39", new TextEncoder().encode("ABC"));
    expect(f.observe(1, k, "code_39", "ABC", 0).kind).toBe("candidate");
    expect(f.observe(1, k, "code_39", "ABC", 33).kind).toBe("detect");
    expect(f.observe(1, k, "code_39", "ABC", 66).kind).toBe("duplicate");
    // Código visible de forma continua (frames cada 100 ms): se re-emite al cumplirse el cooldown.
    let last = "";
    for (let t = 100; t <= 2100; t += 100) last = f.observe(1, k, "code_39", "ABC", t).kind;
    expect(last).toBe("detect");
  });

  it("una lectura contradictoria en el mismo track reinicia el voto", () => {
    const f = new Fusion(opt);
    const a = contentKey("itf", new TextEncoder().encode("123456"));
    const b = contentKey("itf", new TextEncoder().encode("123457"));
    expect(f.observe(1, a, "itf", "123456", 0).kind).toBe("candidate");
    expect(f.observe(1, b, "itf", "123457", 30).kind).toBe("candidate");
    expect(f.observe(1, a, "itf", "123456", 60).kind).toBe("candidate");
    expect(f.observe(1, a, "itf", "123456", 90).kind).toBe("detect");
  });

  it("EAN leído solo por escalado (weak) necesita 2 frames; el de la pasada normal, 1", () => {
    const f = new Fusion(opt);
    const k = contentKey("ean_13", new TextEncoder().encode("2548033204265"));
    expect(f.observe(1, k, "ean_13", "2548033204265", 0, true).kind).toBe("candidate");
    expect(f.observe(1, k, "ean_13", "2548033204265", 66, true).kind).toBe("detect");
    const g = new Fusion(opt);
    expect(g.observe(2, k, "ean_13", "2548033204265", 0).kind).toBe("detect");
  });

  it("fuera de la ventana el voto se reinicia", () => {
    const f = new Fusion(opt);
    const k = contentKey("codabar", new TextEncoder().encode("A12B"));
    f.observe(1, k, "codabar", "A12B", 0);
    expect(f.observe(1, k, "codabar", "A12B", 2000).kind).toBe("candidate");
  });
});
