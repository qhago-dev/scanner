// Cambio de cámara y de dimensiones del stream (shim con 2 cámaras: Firefox/WebKit).
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createScanner, type Scanner, type TrackedResult } from "../../src/index";
import { configureForTests } from "../browser/setup";

let scanner: Scanner | null = null;
beforeAll(() => configureForTests());
afterEach(() => {
  scanner?.destroy();
  scanner = null;
});

const fake = () =>
  (globalThis as { __qhagoFakeCamera?: { resize(w: number, h: number): void } }).__qhagoFakeCamera;
const shim = !/Chrome\//.test(navigator.userAgent);

function next(s: Scanner, types: ("detect" | "track")[], timeout = 10_000): Promise<TrackedResult> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`sin ${types.join("/")}`)), timeout);
    const offs = types.map((ty) =>
      s.on(ty, (e) => {
        clearTimeout(t);
        for (const o of offs) o();
        resolve(e.result);
      }),
    );
  });
}

describe.runIf(shim)("cámaras y dimensiones", () => {
  it("switchCamera: cambia de dispositivo y sigue leyendo", async () => {
    scanner = createScanner({ formats: ["ean_13"], camera: { rememberCamera: false } });
    await scanner.start();
    await next(scanner, ["detect"]);
    const cams = await scanner.listCameras();
    expect(cams.map((c) => c.deviceId)).toEqual(["fake-back", "fake-front"]);
    await scanner.switchCamera("fake-front");
    expect(scanner.state).toBe("scanning");
    const track = (scanner.video?.srcObject as MediaStream | null)?.getVideoTracks()[0];
    expect(track?.label).toBe("Fake Front Camera");
    // Regresión: cambiar justo tras una lectura dejaba un frame "en vuelo" del worker anterior y el scheduler
    // no volvía a enviar frames. Tras reiniciar la sesión, el código vuelve a detectarse o a seguirse.
    await next(scanner, ["detect", "track"]);
  });

  it("cambio de dimensiones en caliente: el tracking se reinicia y las coordenadas usan el nuevo tamaño", async () => {
    scanner = createScanner({ formats: ["ean_13"], camera: { rememberCamera: false } });
    await scanner.start();
    await next(scanner, ["detect"]);
    fake()?.resize(800, 600);
    await new Promise((r) => setTimeout(r, 400));
    const r = await next(scanner, ["detect", "track"]);
    for (const p of r.cornerPoints) {
      expect(p.x).toBeLessThanOrEqual(800);
      expect(p.y).toBeLessThanOrEqual(600);
    }
    expect(scanner.video?.videoWidth).toBe(800);
  });
});

describe("reinicio con un frame en vuelo", () => {
  it("stop() justo tras una lectura y start(): sigue procesando frames", async () => {
    scanner = createScanner({
      formats: ["ean_13"],
      camera: { rememberCamera: false },
      frameStats: true,
    });
    await scanner.start();
    await next(scanner, ["detect"]);
    await scanner.stop();
    await scanner.start();
    let frames = 0;
    scanner.on("frame", () => frames++);
    await new Promise((r) => setTimeout(r, 1500));
    expect(frames).toBeGreaterThan(3);
  });
});
