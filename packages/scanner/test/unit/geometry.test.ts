import { describe, expect, it } from "vitest";
import { mapPoints } from "../../src/geometry";

const src = { width: 1280, height: 720 };
const P = [
  { x: 0, y: 0 },
  { x: 1280, y: 720 },
  { x: 640, y: 360 },
];

describe("mapPoints", () => {
  it("contain: barras arriba/abajo", () => {
    expect(mapPoints(P, src, { width: 640, height: 640 }, "contain")).toEqual([
      { x: 0, y: 140 },
      { x: 640, y: 500 },
      { x: 320, y: 320 },
    ]);
  });
  it("cover: recorta los lados", () => {
    const r = mapPoints(P, src, { width: 360, height: 640 }, "cover");
    const s = 640 / 720;
    expect(r[0]).toEqual({ x: (360 - 1280 * s) / 2, y: 0 });
    expect(r[2]).toEqual({ x: 180, y: 320 });
  });
  it("fill: escala independiente", () => {
    expect(mapPoints(P, src, { width: 640, height: 720 }, "fill")[1]).toEqual({ x: 640, y: 720 });
  });
  it("none y scale-down", () => {
    expect(mapPoints(P, src, { width: 640, height: 360 }, "none")[0]).toEqual({ x: -320, y: -180 });
    expect(mapPoints(P, src, { width: 2560, height: 1440 }, "scale-down")[1]).toEqual({
      x: 1920,
      y: 1080,
    });
  });
  it("object-position y espejado", () => {
    expect(mapPoints(P, src, { width: 640, height: 640 }, "contain", { x: 0.5, y: 0 })[0]).toEqual({
      x: 0,
      y: 0,
    });
    expect(
      mapPoints([{ x: 0, y: 0 }], src, { width: 640, height: 360 }, "fill", undefined, true),
    ).toEqual([{ x: 640, y: 0 }]);
  });
});
