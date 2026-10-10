// Contrato del polyfill con la spec de BarcodeDetector (+ fixtures grabados del nativo si existen).
import { beforeAll, describe, expect, it } from "vitest";
import { BarcodeDetectorPolyfill, installPolyfill } from "../../src/polyfill/index";
import { bitmapOf, canvasOf, configureForTests, fixture } from "./setup";

const EAN = "5901234123457";

beforeAll(() => configureForTests());

/** Fixtures exportados desde apps/demo/diagnostics.html en Chrome con BarcodeDetector nativo. */
const NATIVE = import.meta.glob<{
  image: string;
  ua: string;
  results: { format: string; rawValue: string; cornerPoints: { x: number; y: number }[] }[];
}>("../fixtures/native/*.json", { eager: true, import: "default" });

function shape(r: unknown): void {
  const d = r as Record<string, unknown>;
  expect(Object.keys(d).sort()).toEqual(["boundingBox", "cornerPoints", "format", "rawValue"]);
  expect(d.boundingBox).toBeInstanceOf(DOMRectReadOnly);
  expect(d.cornerPoints).toHaveLength(4);
  // Orden de la spec: empezando arriba-izquierda, en sentido horario.
  const [a, b, c] = d.cornerPoints as { x: number; y: number }[];
  const cross =
    ((b as { x: number }).x - (a as { x: number }).x) *
      ((c as { y: number }).y - (a as { y: number }).y) -
    ((b as { y: number }).y - (a as { y: number }).y) *
      ((c as { x: number }).x - (a as { x: number }).x);
  expect(cross).toBeGreaterThan(0);
}

describe("BarcodeDetectorPolyfill", () => {
  it("getSupportedFormats devuelve los 13 formatos", async () => {
    expect(await BarcodeDetectorPolyfill.getSupportedFormats()).toHaveLength(13);
  });

  it("lanza TypeError con formatos vacíos o desconocidos (spec)", () => {
    expect(() => new BarcodeDetectorPolyfill({ formats: [] })).toThrow(TypeError);
    expect(() => new BarcodeDetectorPolyfill({ formats: ["unknown"] })).toThrow(TypeError);
  });

  it("detect() con ImageBitmap, canvas, <img>, Blob y ImageData", async () => {
    const det = new BarcodeDetectorPolyfill({ formats: ["ean_13"] });
    const bmp = await bitmapOf("ean13-synthetic.png");
    const canvas = canvasOf(bmp);
    const img = new Image();
    img.src = URL.createObjectURL(await fixture("ean13-synthetic.png"));
    await img.decode();
    const data = canvas
      .getContext("2d")
      ?.getImageData(0, 0, canvas.width, canvas.height) as ImageData;
    for (const src of [bmp, canvas, img, await fixture("ean13-synthetic.png"), data]) {
      const [r, ...rest] = await det.detect(src as ImageBitmapSource);
      expect(rest).toHaveLength(0);
      shape(r);
      expect(r?.format).toBe("ean_13");
      expect(r?.rawValue).toBe(EAN);
    }
  });

  it("detect() con <video> y SVGImageElement", async () => {
    const det = new BarcodeDetectorPolyfill();
    const blobUrl = URL.createObjectURL(await fixture("ean13-synthetic.png"));
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const im = document.createElementNS("http://www.w3.org/2000/svg", "image");
    const bmp = await bitmapOf("ean13-synthetic.png");
    svg.setAttribute("width", String(bmp.width));
    svg.setAttribute("height", String(bmp.height));
    im.setAttribute("width", String(bmp.width));
    im.setAttribute("height", String(bmp.height));
    im.setAttribute("href", blobUrl);
    svg.append(im);
    document.body.append(svg);
    await new Promise((r) => im.addEventListener("load", r, { once: true }));
    expect((await det.detect(im))[0]?.rawValue).toBe(EAN);

    // <video> desde un canvas animado (captureStream).
    const canvas = canvasOf(bmp);
    const video = document.createElement("video");
    video.muted = true;
    // Spec: sin frame actual → [].
    expect(await det.detect(video)).toEqual([]);
    video.srcObject = canvas.captureStream(5);
    // El WebKit de Playwright en Linux no reproduce captureStream (limitación del entorno): se omite ahí.
    const played = await Promise.race([
      video.play().then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 3000)),
    ]);
    if (played) {
      await new Promise((r) => setTimeout(r, 300));
      expect((await det.detect(video))[0]?.rawValue).toBe(EAN);
    }
    svg.remove();
  });

  it("installPolyfill no pisa un BarcodeDetector existente salvo force", () => {
    const g = globalThis as { BarcodeDetector?: unknown };
    const prev = g.BarcodeDetector;
    g.BarcodeDetector = undefined;
    installPolyfill();
    expect(g.BarcodeDetector).toBe(BarcodeDetectorPolyfill);
    const fake = class {};
    g.BarcodeDetector = fake;
    installPolyfill();
    expect(g.BarcodeDetector).toBe(fake);
    installPolyfill({ force: true });
    expect(g.BarcodeDetector).toBe(BarcodeDetectorPolyfill);
    g.BarcodeDetector = prev;
  });

  for (const [path, fx] of Object.entries(NATIVE)) {
    it(`coincide con el nativo: ${path.split("/").pop()} (${fx.ua.slice(0, 40)})`, async () => {
      const got = await new BarcodeDetectorPolyfill().detect(await fixture(fx.image));
      for (const want of fx.results) {
        const hit = got.find((g) => g.format === want.format && g.rawValue === want.rawValue);
        expect(hit, `${want.format} ${want.rawValue}`).toBeDefined();
        // Esquinas dentro del 5 % del lado del código.
        const [w0, w1] = want.cornerPoints as [{ x: number; y: number }, { x: number; y: number }];
        const side = Math.hypot(w1.x - w0.x, w1.y - w0.y);
        hit?.cornerPoints.forEach((p, i) => {
          expect(
            Math.hypot(p.x - (want.cornerPoints[i]?.x ?? 0), p.y - (want.cornerPoints[i]?.y ?? 0)),
          ).toBeLessThan(side * 0.05 + 3);
        });
      }
    });
  }
});

declare global {
  interface ImportMeta {
    glob<T>(pattern: string, opts: { eager: true; import: "default" }): Record<string, T>;
  }
}
