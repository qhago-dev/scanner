// Plugins en la sesión de vídeo (F5.6) con la cámara simulada.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createScanner, isScanError, type Scanner } from "../../src/index";
import { configureForTests } from "../browser/setup";

let scanner: Scanner | null = null;
beforeAll(() => configureForTests());
afterEach(() => {
  scanner?.destroy();
  scanner = null;
});

const fakeWorker = () =>
  new Worker(new URL("./fake-plugin-worker.ts", import.meta.url), { type: "module" });
const plugins = [{ name: "fake", apiVersion: 1 as const }];

describe("plugins en createScanner()", () => {
  it("el worker ejecuta el plugin en cada frame (when: always) y se sigue detectando", async () => {
    scanner = createScanner({
      formats: ["ean_13"],
      workerFactory: fakeWorker,
      plugins,
      frameStats: true,
      camera: { rememberCamera: false },
    });
    const passes: string[] = [];
    scanner.on("frame", (e) => passes.push(...e.passes));
    const errors: unknown[] = [];
    scanner.on("error", (e) => errors.push(e.error));
    const got = new Promise((r) => scanner?.on("detect", r));
    await scanner.start();
    await got;
    await new Promise((r) => setTimeout(r, 500));
    expect(errors).toEqual([]);
    expect(passes).toContain("plugin:fake");
  });

  it("plugin sin worker compatible → start() rechaza con UNSUPPORTED", async () => {
    scanner = createScanner({ formats: ["ean_13"], plugins, camera: { rememberCamera: false } });
    const e = await scanner.start().catch((x) => x);
    expect(isScanError(e) && e.code).toBe("UNSUPPORTED");
  });
});
