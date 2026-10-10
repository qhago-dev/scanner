import { beforeAll, describe, expect, it } from "vitest";
import { configure, resetConfig } from "../../src/config";
import { resetEngine } from "../../src/engine/load-browser";
import { decode, init } from "../../src/index";
import { terminateWorker } from "../../src/worker/client";
import { bitmapOf, canvasOf, configureForTests, fixture } from "./setup";

const EAN = "5901234123457";

beforeAll(async () => {
  configureForTests();
  await init();
});

describe("decode() en navegador", () => {
  it("Blob vía worker interno (main thread)", async () => {
    const [r] = await decode(await fixture("ean13-synthetic.png"));
    expect(r?.format).toBe("ean_13");
    expect(r?.text).toBe(EAN);
    expect(r?.bytes).toBeInstanceOf(Uint8Array);
  });

  it("mismo resultado con worker: false (inline)", async () => {
    const [r] = await decode(await fixture("code128-synthetic.png"), { worker: false });
    expect(r?.text).toBe("HELLO-WORLD");
  });

  it("acepta ImageBitmap, canvas, ImageData, OffscreenCanvas, <img>, Uint8Array y RawImage", async () => {
    const bmp = await bitmapOf("ean13-synthetic.png");
    const canvas = canvasOf(bmp);
    const ctx = canvas.getContext("2d");
    const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height) as ImageData;
    const off = new OffscreenCanvas(bmp.width, bmp.height);
    off.getContext("2d")?.drawImage(bmp, 0, 0);
    const img = new Image();
    img.src = URL.createObjectURL(await fixture("ean13-synthetic.png"));
    await img.decode();
    const bytes = new Uint8Array(await (await fixture("ean13-synthetic.png")).arrayBuffer());
    const raw = {
      data: imageData.data,
      width: imageData.width,
      height: imageData.height,
      format: "rgba" as const,
    };
    for (const input of [bmp, canvas, imageData, off, img, bytes, raw]) {
      for (const worker of [true, false]) {
        const [r] = await decode(input, { worker });
        expect(r?.text, `${input.constructor.name} worker=${worker}`).toBe(EAN);
      }
    }
    // No se alteran los objetos del usuario (copia/clonado antes de transferir).
    expect(imageData.data.byteLength).toBeGreaterThan(0);
    expect(bmp.width).toBeGreaterThan(0);
  });

  it("VideoFrame (si el navegador lo soporta)", async () => {
    if (typeof VideoFrame !== "function") return;
    const canvas = canvasOf(await bitmapOf("ean13-synthetic.png"));
    const frame = new VideoFrame(canvas, { timestamp: 0 });
    for (const worker of [true, false])
      expect((await decode(frame, { worker }))[0]?.text).toBe(EAN);
    frame.close();
  });

  it("errores tipados cruzan el worker", async () => {
    await expect(decode(new Blob([new Uint8Array([1, 2, 3])]))).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(
      decode(await fixture("ean13-synthetic.png"), { maxInputPixels: 100 }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    const ac = new AbortController();
    ac.abort();
    await expect(
      decode(await fixture("ean13-synthetic.png"), { signal: ac.signal }),
    ).rejects.toMatchObject({ code: "ABORTED" });
  });

  it('engine: "native" sin BarcodeDetector → UNSUPPORTED', async () => {
    if ("BarcodeDetector" in globalThis) return;
    await expect(
      decode(await fixture("ean13-synthetic.png"), { engine: "native" }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED",
    });
    // "auto" sin nativo cae al motor wasm
    expect((await decode(await fixture("ean13-synthetic.png"), { engine: "auto" }))[0]?.text).toBe(
      EAN,
    );
  });

  it("wasmUrl inválida → ENGINE_LOAD_FAILED con pista", async () => {
    terminateWorker();
    resetEngine();
    resetConfig();
    configure({ wasmUrl: "/no-existe.wasm" });
    await expect(
      decode(await fixture("ean13-synthetic.png"), { worker: false }),
    ).rejects.toMatchObject({
      code: "ENGINE_LOAD_FAILED",
      message: expect.stringContaining("/no-existe.wasm"),
    });
    resetEngine();
    resetConfig();
    configureForTests();
  });
});
