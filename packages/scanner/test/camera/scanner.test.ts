// Cámara simulada de Chromium (clip y4m con un EAN-13 en movimiento): las 3 rutas de captura.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createScanner,
  type Scanner,
  type ScannerRoute,
  type TrackedResult,
} from "../../src/index";
import { configureForTests } from "../browser/setup";

const EAN = "5901234123457";
let scanner: Scanner | null = null;

beforeAll(() => configureForTests());
afterEach(() => {
  scanner?.destroy();
  scanner = null;
});

function firstDetect(s: Scanner, timeout = 15_000): Promise<TrackedResult> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("sin detect")), timeout);
    s.on("detect", (e) => {
      clearTimeout(t);
      resolve(e.result);
    });
    s.on("error", (e) => {
      clearTimeout(t);
      reject(e.error);
    });
  });
}

describe("createScanner con cámara simulada", () => {
  for (const route of ["track-processor", "frame-callback", "inline"] as ScannerRoute[]) {
    it(`detecta el EAN-13 (ruta ${route})`, async () => {
      const video = document.createElement("video");
      document.body.append(video);
      scanner = createScanner({
        video,
        route,
        formats: ["ean_13"],
        camera: { rememberCamera: false },
        workerFactory: () =>
          new Worker(new URL("../../src/worker/worker.ts", import.meta.url), { type: "module" }),
      });
      const states: string[] = [];
      scanner.on("state", (e) => states.push(e.state));
      const got = firstDetect(scanner);
      await scanner.start();
      expect(scanner.route).toBe(route);
      const r = await got;
      expect(r.text).toBe(EAN);
      expect(r.trackId).toBeGreaterThan(0);
      // Coordenadas en el espacio del vídeo original (640x480).
      expect(r.boundingBox.x).toBeGreaterThan(0);
      expect(r.boundingBox.x + r.boundingBox.width).toBeLessThanOrEqual(video.videoWidth + 1);
      expect(states).toEqual(["starting", "scanning"]);
      video.remove();
    });
  }

  it("deduplica: el mismo código continuo se emite una vez dentro del cooldown", async () => {
    scanner = createScanner({
      formats: ["ean_13"],
      camera: { rememberCamera: false },
      fusion: { duplicateCooldownMs: 60_000 },
    });
    let n = 0;
    scanner.on("detect", () => n++);
    await scanner.start();
    await new Promise((r) => setTimeout(r, 3000));
    expect(n).toBe(1);
  });

  it("pause/resume/stop/destroy: estados, tracks detenidos e idempotencia", async () => {
    scanner = createScanner({ formats: ["ean_13"], camera: { rememberCamera: false } });
    await scanner.start();
    const stream = scanner.video?.srcObject as MediaStream;
    scanner.pause();
    expect(scanner.state).toBe("paused");
    scanner.resume();
    expect(scanner.state).toBe("scanning");
    await scanner.stop();
    await scanner.stop();
    expect(scanner.state).toBe("stopped");
    expect(stream.getTracks().every((t) => t.readyState === "ended")).toBe(true);
    await scanner.start(); // reinicio tras stop
    expect(scanner.state).toBe("scanning");
    scanner.destroy();
    scanner.destroy();
    expect(scanner.state).toBe("destroyed");
    await expect(scanner.start()).rejects.toMatchObject({ code: "UNSUPPORTED" });
  });

  it("stream externo: no se detiene en stop()", async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    scanner = createScanner({ stream, formats: ["ean_13"] });
    await scanner.start();
    await scanner.stop();
    expect(stream.getTracks().every((t) => t.readyState === "live")).toBe(true);
    for (const t of stream.getTracks()) t.stop();
  });

  it("ROI fuera del código: no detecta", async () => {
    scanner = createScanner({
      formats: ["ean_13"],
      roi: { x: 0, y: 0, width: 0.15, height: 0.15 },
      camera: { rememberCamera: false },
    });
    let n = 0;
    scanner.on("detect", () => n++);
    await scanner.start();
    await new Promise((r) => setTimeout(r, 2000));
    expect(n).toBe(0);
  });

  it("frameStats emite fps y ms", async () => {
    scanner = createScanner({
      formats: ["ean_13"],
      frameStats: true,
      camera: { rememberCamera: false },
    });
    const stats = new Promise<{ fps: number; ms: number }>((resolve) =>
      scanner?.on("frame", (e) => resolve(e)),
    );
    await scanner.start();
    const s = await stats;
    expect(s.ms).toBeGreaterThanOrEqual(0);
    expect(s.fps).toBeGreaterThan(0);
  });
});
