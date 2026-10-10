// <qhago-scanner> y quagga-compat con la cámara simulada (EAN-13 en movimiento).
import axe from "axe-core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Quagga, type QuaggaJSResultObject } from "../../src/quagga-compat/index";
import type { TrackedResult } from "../../src/scanner/types";
import "../../src/ui/index";
import { configureForTests } from "../browser/setup";

const EAN = "5901234123457";

beforeAll(() => configureForTests());
afterEach(async () => {
  document.body.innerHTML = "";
  await Quagga.stop();
});

describe("<qhago-scanner>", () => {
  it("emite detect, anuncia la lectura en aria-live y dibuja el overlay", async () => {
    const el = document.createElement("qhago-scanner");
    el.setAttribute("formats", "ean_13");
    el.setAttribute("lang", "es");
    el.setAttribute("switch-camera-button", "");
    el.style.width = "480px";
    const got = new Promise<TrackedResult>((resolve, reject) => {
      el.addEventListener("detect", (e) => resolve((e as CustomEvent<TrackedResult>).detail), {
        once: true,
      });
      el.addEventListener("error", (e) => reject((e as unknown as CustomEvent).detail), {
        once: true,
      });
    });
    document.body.append(el);
    const r = await got;
    expect(r.text).toBe(EAN);
    const root = el.shadowRoot as ShadowRoot;
    expect(root.querySelector('[role="status"]')?.textContent).toBe(`Leído: ${EAN}`);
    const sw = root.querySelector('[part~="switch"]') as HTMLButtonElement;
    expect(sw.hidden).toBe(false);
    expect(sw.getAttribute("aria-label")).toBe("Cambiar de cámara");
    expect(el.scanner?.state).toBe("scanning");
    // El overlay pinta algo en el canvas tras un par de frames de animación.
    await new Promise((r) => setTimeout(r, 200));
    const c = root.querySelector("canvas") as HTMLCanvasElement;
    const px =
      c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data ?? new Uint8ClampedArray();
    expect(px.some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
    el.remove();
    expect(el.scanner).toBeNull();
  });

  it("axe-core: sin violaciones de accesibilidad (shadow DOM incluido)", async () => {
    document.documentElement.lang = "es";
    document.title = "test";
    const el = document.createElement("qhago-scanner");
    el.setAttribute("torch-button", "");
    el.setAttribute("switch-camera-button", "");
    el.setAttribute("formats", "ean_13");
    const got = new Promise((r) => el.addEventListener("detect", r, { once: true }));
    document.body.append(el);
    await got;
    // Contexto = el componente (las reglas de página, como landmark-one-main, no aplican a un widget).
    const res = await axe.run(el, { runOnly: ["wcag2a", "wcag2aa", "best-practice"] });
    expect(
      res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    ).toEqual([]);
  });

  it("paused no arranca la cámara hasta quitar el atributo", async () => {
    const el = document.createElement("qhago-scanner");
    el.setAttribute("paused", "");
    document.body.append(el);
    expect(el.scanner).toBeNull();
    const got = new Promise((r) => el.addEventListener("detect", r, { once: true }));
    el.removeAttribute("paused");
    await got;
    expect(el.scanner?.state).toBe("scanning");
  });
});

describe("quagga-compat", () => {
  it("init/start/onDetected/onProcessed como Quagga2", async () => {
    const target = document.createElement("div");
    target.id = "interactive";
    target.className = "viewport";
    document.body.append(target);
    const warn = console.warn;
    const warnings: string[] = [];
    console.warn = (m: string) => warnings.push(m);
    await new Promise<void>((resolve, reject) =>
      Quagga.init(
        {
          inputStream: {
            type: "LiveStream",
            target,
            constraints: { width: 640, height: 480, facingMode: "environment" },
          },
          locator: { patchSize: "medium", halfSample: true },
          decoder: { readers: ["ean_reader", "foo_reader"] },
        },
        (err) => (err ? reject(err) : resolve()),
      ),
    );
    console.warn = warn;
    expect(warnings.some((w) => w.includes("locator"))).toBe(true);
    expect(warnings.some((w) => w.includes("foo_reader"))).toBe(true);
    expect(target.querySelector("video")).not.toBeNull();
    expect(Quagga.canvas.dom.overlay?.className).toBe("drawingBuffer");

    const processed: (QuaggaJSResultObject | undefined)[] = [];
    Quagga.onProcessed((r) => processed.push(r));
    const detected = new Promise<QuaggaJSResultObject>((r) => Quagga.onDetected(r));
    Quagga.start();
    const res = await detected;
    expect(res.codeResult.code).toBe(EAN);
    expect(res.codeResult.format).toBe("ean_13");
    expect(res.box).toHaveLength(4);
    expect(res.line).toHaveLength(2);
    await new Promise((r) => setTimeout(r, 300));
    expect(processed.length).toBeGreaterThan(0);
    expect(processed.some((p) => p?.codeResult?.code === EAN)).toBe(true);
    // drawPath acepta {x,y} y [x,y].
    const ctx = Quagga.canvas.ctx.overlay as CanvasRenderingContext2D;
    Quagga.ImageDebug.drawPath(res.box, { x: 0, y: 1 }, ctx, { color: "green", lineWidth: 2 });
    Quagga.ImageDebug.drawPath(res.line, { x: "x", y: "y" }, ctx, { color: "red", lineWidth: 3 });
    Quagga.offProcessed();
    Quagga.offDetected();
  });
});
