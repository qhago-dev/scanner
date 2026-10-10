// ScannerSession en proceso (Node): en el navegador corre dentro del worker, donde la cobertura no llega.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Platform } from "../../src/core";
import { loadEngine } from "../../src/engine/load-node";
import { toRaster } from "../../src/input/node";
import { PluginRegistry } from "../../src/plugins";
import { ScannerSession, type WireEvent } from "../../src/scanner/session";
import type { ScannerWorkerOptions } from "../../src/scanner/types";
import type { RawImage } from "../../src/types";

const platform: Platform = { loadEngine, toRaster };
const W = 960;
const H = 540;
let code: RawImage;

beforeAll(async () => {
  const e = await loadEngine();
  const r = await toRaster(
    new Uint8Array(await readFile(join(import.meta.dirname, "../fixtures/ean13-synthetic.png"))),
    e,
  );
  code = { data: r.data as Uint8Array, width: r.width, height: r.height, format: "luma" };
});

/** Frame W×H gris con el código pegado en (x, y); sin código si x < 0. */
function frame(x: number, y: number): RawImage {
  const data = new Uint8Array(W * H).fill(200);
  if (x >= 0)
    for (let j = 0; j < code.height; j++)
      data.set(code.data.subarray(j * code.width, (j + 1) * code.width), (y + j) * W + x);
  return { data, width: W, height: H, format: "luma" };
}

const opts = (o: Partial<ScannerWorkerOptions> = {}): ScannerWorkerOptions => ({
  formats: ["ean_13"],
  strategy: "fast",
  roi: "full",
  fusion: { confirmFrames: "auto", windowMs: 1500, duplicateCooldownMs: 2000 },
  escalateAfterFrames: 2,
  maxCodes: 4,
  lostAfterMs: 300,
  validateChecksums: true,
  ...o,
});

function run(o?: Partial<ScannerWorkerOptions>, registry?: PluginRegistry) {
  const events: WireEvent[] = [];
  const s = new ScannerSession(opts(o), platform, (e) => events.push(e), registry);
  let t = 0;
  const step = async (img: RawImage, dt = 66) => {
    t += dt;
    return s.process(img, { ts: t, srcWidth: W * 2, srcHeight: H * 2 });
  };
  return { s, events, step };
}

describe("ScannerSession", () => {
  it("detect una vez, track mientras se mueve, lost al desaparecer; coordenadas al tamaño original", async () => {
    const { events, step } = run();
    for (let i = 0; i < 5; i++) await step(frame(100 + i * 10, 100));
    for (let i = 0; i < 6; i++) await step(frame(-1, 0), 100);
    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === "detect")).toHaveLength(1);
    expect(types.filter((t) => t === "track").length).toBeGreaterThanOrEqual(3);
    expect(types.at(-1)).toBe("lost");
    const det = events.find((e) => e.type === "detect");
    // srcWidth = 2 × raster: las esquinas se escalan ×2.
    if (det?.type === "detect") expect(det.result.cornerPoints[0].x).toBeGreaterThan(200);
  });

  it("barrido rotativo en thorough tras escalateAfterFrames frames vacíos", async () => {
    const { step } = run();
    const passes: string[] = [];
    for (let i = 0; i < 4; i++) passes.push(...(await step(frame(-1, 0))).passes);
    expect(passes.some((p) => p.startsWith("thorough:"))).toBe(true);
  });

  it("ROI: un código fuera de la ROI no se lee", async () => {
    const { events, step } = run({
      roi: { x: 0.6, y: 0.6, width: 0.4, height: 0.4 },
      escalateAfterFrames: 99,
    });
    for (let i = 0; i < 3; i++) await step(frame(20, 20));
    expect(events.some((e) => e.type === "detect")).toBe(false);
  });

  it("plugins: fallback solo tras frames sin lectura", async () => {
    let calls = 0;
    const reg = new PluginRegistry({
      p: () => ({
        name: "p",
        async onFrame() {
          calls++;
          return [
            {
              quad: [
                { x: 0, y: 0 },
                { x: W, y: 0 },
                { x: W, y: H },
                { x: 0, y: H },
              ],
              score: 0.8,
            },
          ];
        },
      }),
    });
    // Frames vacíos → corre el plugin; con lectura clásica, no.
    const { events, step } = run(
      { plugins: [{ name: "p", apiVersion: 1 }], escalateAfterFrames: 1 },
      reg,
    );
    await step(frame(-1, 0));
    await step(frame(-1, 0));
    expect(calls).toBeGreaterThan(0);
    const before = calls;
    await step(frame(300, 200));
    expect(events.some((e) => e.type === "detect" || e.type === "candidate")).toBe(true);
    expect(calls).toBe(before); // con lectura clásica, el fallback no corre
  });

  it("plugin ausente → un único error UNSUPPORTED", async () => {
    const { events, step } = run({
      plugins: [{ name: "nope", apiVersion: 1 }],
      escalateAfterFrames: 0,
    });
    for (let i = 0; i < 3; i++) await step(frame(-1, 0));
    const errs = events.filter((e) => e.type === "error");
    expect(errs).toHaveLength(1);
    expect(errs[0]?.type === "error" && errs[0].code).toBe("UNSUPPORTED");
  });

  it("configure() y resetTracking()", async () => {
    const { s, events, step } = run();
    await step(frame(100, 100));
    s.resetTracking();
    s.configure({ formats: ["qr_code"] });
    await step(frame(100, 100));
    expect(events.filter((e) => e.type === "detect" || e.type === "candidate")).toHaveLength(1);
  });

  it("entrada inválida → evento error, sin lanzar", async () => {
    const { events, step } = run();
    await step({ data: new Uint8Array(3), width: 10, height: 10, format: "luma" });
    expect(events[0]?.type).toBe("error");
  });
});
