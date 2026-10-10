// F6.3: hilo principal y memoria durante el escaneo (Chromium).
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createScanner, type Scanner } from "../../src/index";
import { configureForTests } from "../browser/setup";

let scanner: Scanner | null = null;
beforeAll(() => configureForTests());
afterEach(() => {
  scanner?.destroy();
  scanner = null;
});

const chromium = /Chrome\//.test(navigator.userAgent);
const heap = () =>
  (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;

describe.runIf(chromium)("rendimiento del hilo principal", () => {
  it("3 s escaneando (ruta por defecto): sin long tasks (> 50 ms) en el main thread", async () => {
    const long: number[] = [];
    const obs = new PerformanceObserver((l) => {
      for (const e of l.getEntries()) long.push(e.duration);
    });
    obs.observe({ type: "longtask", buffered: false });
    scanner = createScanner({
      formats: ["ean_13"],
      camera: { rememberCamera: false },
      frameStats: true,
    });
    let frames = 0;
    scanner.on("frame", () => frames++);
    await scanner.start();
    // El arranque (getUserMedia, worker, WASM) no cuenta: se mide el régimen estable.
    await new Promise((r) => setTimeout(r, 500));
    long.length = 0;
    await new Promise((r) => setTimeout(r, 3000));
    obs.disconnect();
    expect(frames).toBeGreaterThan(10);
    expect(long).toEqual([]);
  });

  // Nocturno: QHAGO_SOAK_MIN=10 (el workflow lo fija); en PR se salta.
  const soakMin = Number(
    (import.meta as { env?: Record<string, string> }).env?.VITE_QHAGO_SOAK_MIN ?? 0,
  );
  it.runIf(soakMin > 0)(
    `memoria estable durante ${soakMin} min (< 10 % de crecimiento del heap JS)`,
    async () => {
      scanner = createScanner({ formats: ["ean_13"], camera: { rememberCamera: false } });
      await scanner.start();
      await new Promise((r) => setTimeout(r, 60_000));
      const base = heap();
      await new Promise((r) => setTimeout(r, (soakMin - 1) * 60_000));
      expect(heap()).toBeLessThan(base * 1.1);
    },
    (soakMin + 1) * 60_000,
  );
});
