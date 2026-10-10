// e2e: worker de @qhago/ai (desde src) + ORT Web WASM + plugin "ai-detector" vía decode().
import { configure, decode, isScanError } from "@qhago/scanner";
import { beforeAll, describe, expect, it } from "vitest";
import { aiDetector } from "../../src/index";

const worker = () =>
  new Worker(new URL("../../src/worker.ts", import.meta.url), { type: "module" });
const modelUrl = new URL("../../models/detector.int8.onnx", import.meta.url).href;
const golden = new URL("../fixtures/golden.json", import.meta.url);

beforeAll(() => {
  configure({ wasmUrl: new URL("../../../scanner/wasm/qhago_engine.wasm", import.meta.url) });
});

describe("@qhago/ai en el navegador", () => {
  it("decode() con aiDetector en su worker lee las imágenes del golden", async () => {
    const g = (await (await fetch(golden)).json()) as {
      file: string;
      objects: { format: string }[];
    }[];
    let read = 0;
    for (const item of g) {
      const img = await (await fetch(new URL(`../fixtures/${item.file}`, import.meta.url))).blob();
      const r = await decode(img, {
        workerFactory: worker,
        plugins: [aiDetector({ when: "always", backend: "wasm", modelUrl, cache: false })],
        formats: [
          "ean_13",
          "ean_8",
          "upc_a",
          "upc_e",
          "code_128",
          "code_39",
          "code_93",
          "codabar",
          "itf",
          "qr_code",
          "data_matrix",
          "pdf417",
          "aztec",
        ],
        strategy: "fast",
      });
      read += r.length;
    }
    expect(read).toBeGreaterThan(0);
  });

  it("sin el worker de @qhago/ai → UNSUPPORTED con un mensaje accionable", async () => {
    const img = await (await fetch(new URL("../fixtures/golden.json", import.meta.url))).blob();
    const e = await decode(img, { plugins: [aiDetector()], worker: false }).catch((x) => x);
    expect(isScanError(e) && e.code).toBe("UNSUPPORTED");
    expect(String(e.message)).toMatch(/aiWorker/);
  });
});
