// SSR-safe (ADR-06): importar cada entrada de navegador en Node sin DOM no debe lanzar ni tocar window/document.
import { describe, expect, it } from "vitest";

describe("SSR", () => {
  it.each([
    ["src/index", "decode"],
    ["src/polyfill/index", "installPolyfill"],
    ["src/quagga-compat/index", "Quagga"],
    ["src/ui/index", "QhagoScannerElement"],
    ["src/parsers/index", "parseGS1"],
    ["src/worker-host", "startWorkerHost"],
  ])("importar %s en Node no falla", async (path, name) => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
    const mod = await import(`../../${path}`);
    expect(mod[name]).toBeDefined();
  });

  it("getEnvironmentReport en Node", async () => {
    const { getEnvironmentReport } = await import("../../src/index.node");
    const r = await getEnvironmentReport();
    expect(r.runtime).toBe("node");
    expect(r.abi).toBe(1);
    expect(r.features.webAssembly).toBe(true);
  });

  it("polyfill: validación de formatos según la spec", async () => {
    const { BarcodeDetectorPolyfill } = await import("../../src/polyfill/index");
    expect(() => new BarcodeDetectorPolyfill({ formats: [] })).toThrow(TypeError);
    expect(() => new BarcodeDetectorPolyfill({ formats: ["foo"] })).toThrow(TypeError);
    expect(await BarcodeDetectorPolyfill.getSupportedFormats()).toHaveLength(13);
  });
});
