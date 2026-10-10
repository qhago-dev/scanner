// Rutas poco ejercitadas: engine native/auto (BarcodeDetector simulado), diagnóstico, quagga-compat sin cámara.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { decode, getEnvironmentReport, isScanError } from "../../src/index";
import { BarcodeDetectorPolyfill } from "../../src/polyfill/index";
import { isValidVin, Quagga } from "../../src/quagga-compat/index";
import { configureForTests, fixture } from "./setup";

const EAN = "5901234123457";
const g = globalThis as { BarcodeDetector?: unknown };
const prev = g.BarcodeDetector;

/** "Nativo" simulado: un BarcodeDetector que delega en el polyfill pero NO lleva la marca __qhagoPolyfill. */
class FakeNative {
  static calls = 0;
  static formats = ["ean_13", "qr_code"];
  static async getSupportedFormats() {
    return FakeNative.formats;
  }
  private inner: BarcodeDetectorPolyfill;
  constructor(o?: { formats: string[] }) {
    this.inner = new BarcodeDetectorPolyfill(o);
  }
  async detect(src: ImageBitmapSource) {
    FakeNative.calls++;
    return this.inner.detect(src);
  }
}

beforeAll(() => configureForTests());
afterEach(() => {
  g.BarcodeDetector = prev;
  FakeNative.calls = 0;
});

describe("engine native/auto", () => {
  it('"native" usa BarcodeDetector y devuelve BarcodeResult completo', async () => {
    g.BarcodeDetector = FakeNative;
    const [r] = await decode(await fixture("ean13-synthetic.png"), {
      engine: "native",
      formats: ["ean_13"],
    });
    expect(FakeNative.calls).toBe(1);
    expect(r).toMatchObject({ format: "ean_13", text: EAN });
    expect(r?.bytes).toBeInstanceOf(Uint8Array);
    expect(r?.cornerPoints).toHaveLength(4);
  });

  it('"auto" usa el nativo si soporta los formatos y WASM si no', async () => {
    g.BarcodeDetector = FakeNative;
    await decode(await fixture("ean13-synthetic.png"), { engine: "auto", formats: ["ean_13"] });
    expect(FakeNative.calls).toBe(1);
    const [r] = await decode(await fixture("code128-synthetic.png"), {
      engine: "auto",
      formats: ["code_128"],
    });
    expect(FakeNative.calls).toBe(1);
    expect(r?.text).toBe("HELLO-WORLD");
  });

  it('"native" sin BarcodeDetector → UNSUPPORTED', async () => {
    g.BarcodeDetector = undefined;
    const e = await decode(await fixture("ean13-synthetic.png"), { engine: "native" }).catch(
      (x) => x,
    );
    expect(isScanError(e) && e.code).toBe("UNSUPPORTED");
  });

  it("native con RawImage", async () => {
    g.BarcodeDetector = FakeNative;
    const bmp = await createImageBitmap(await fixture("ean13-synthetic.png"));
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext("2d") as OffscreenCanvasRenderingContext2D;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height);
    const [r] = await decode(
      { data: d.data, width: d.width, height: d.height, format: "rgba" },
      { engine: "native", formats: ["ean_13"] },
    );
    expect(r?.text).toBe(EAN);
  });
});

describe("getEnvironmentReport (navegador)", () => {
  it("detecta capacidades sin datos personales", async () => {
    const r = await getEnvironmentReport();
    expect(r.runtime).toBe("browser");
    expect(r.features.webAssembly).toBe(true);
    expect(typeof r.features.wasmSimd).toBe("boolean");
    expect(JSON.stringify(r)).not.toMatch(/deviceId|label/);
  });
});

describe("quagga-compat sin cámara", () => {
  it("decodeSingle con readers y src", async () => {
    const src = URL.createObjectURL(await fixture("ean13-synthetic.png"));
    const r = await new Promise((resolve) =>
      Quagga.decodeSingle({ src, decoder: { readers: ["ean_reader"] } }, resolve),
    );
    expect((r as { codeResult: { code: string } }).codeResult.code).toBe(EAN);
    const none = await Quagga.decodeSingle({ src, decoder: { readers: ["code_128_reader"] } });
    expect(none).toBeUndefined();
  });

  it("isValidVin (ISO 3779)", () => {
    expect(isValidVin("1M8GDM9AXKP042788")).toBe(true);
    expect(isValidVin("1M8GDM9A1KP042788")).toBe(false);
    expect(isValidVin("1M8GDM9AXKP04278")).toBe(false);
  });

  it("setReaders/registerReader avisan una sola vez", () => {
    const warns: string[] = [];
    const w = console.warn;
    console.warn = (m: string) => warns.push(m);
    Quagga.registerReader("x");
    Quagga.registerReader("x");
    Quagga.setReaders(["ean_reader"]);
    console.warn = w;
    expect(warns.filter((m) => m.includes("registerReader"))).toHaveLength(1);
  });
});
