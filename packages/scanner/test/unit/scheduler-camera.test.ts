import { describe, expect, it } from "vitest";
import { cameraError, facingOf, scoreCamera } from "../../src/scanner/camera";
import { Scheduler } from "../../src/scanner/scheduler";

describe("scheduler", () => {
  it("1 frame en vuelo y ritmo adaptativo acotado", () => {
    const s = new Scheduler(15, 4);
    expect(s.canSend(0)).toBe(true);
    s.sent(0);
    expect(s.canSend(1000)).toBe(false); // en vuelo
    s.done(200); // proceso lento → ~4,2 fps
    expect(s.canSend(100)).toBe(false);
    expect(s.canSend(241)).toBe(true);
    for (let i = 0; i < 50; i++) s.done(5); // proceso rápido → tope maxFps
    expect(s.fps).toBeCloseTo(15, 0);
    for (let i = 0; i < 50; i++) s.done(5000);
    expect(s.fps).toBeCloseTo(4, 5);
  });

  it("un frame lento aislado (carga del modelo IA, un barrido) no frena el ritmo (caso Android)", () => {
    const s = new Scheduler(15, 4);
    s.done(4848);
    for (let i = 0; i < 4; i++) s.done(22);
    expect(s.fps).toBeCloseTo(15, 0);
    // escalado periódico caro (1 de cada 4 frames a 650 ms): manda la mediana
    for (let i = 0; i < 16; i++) s.done(i % 4 === 0 ? 650 : 25);
    expect(s.fps).toBeCloseTo(15, 0);
  });
});

describe("cámara", () => {
  it("orientación por etiqueta en varios idiomas", () => {
    expect(facingOf("camera2 0, facing back")).toBe("environment");
    expect(facingOf("Cámara trasera")).toBe("environment");
    expect(facingOf("FaceTime HD Camera")).toBe("user");
    expect(facingOf("USB Camera")).toBe("unknown");
  });
  it("prefiere la principal (no ultra gran angular) y no descarta Dual/Triple Wide de iOS", () => {
    const af = { focusMode: ["continuous"], torch: true } as never;
    expect(scoreCamera("Back Ultra Wide Camera", af)).toBeLessThan(0);
    expect(scoreCamera("Back Dual Wide Camera", af)).toBeGreaterThan(
      scoreCamera("Back Ultra Wide Camera", af),
    );
    expect(scoreCamera("camera2 0, facing back", af)).toBeGreaterThan(
      scoreCamera("camera2 2, facing back", null),
    );
  });
  it("mapea errores de getUserMedia a ScanError", () => {
    expect(cameraError({ name: "NotAllowedError" }).code).toBe("PERMISSION_DENIED");
    expect(cameraError({ name: "NotFoundError" }).code).toBe("NO_CAMERA");
    expect(cameraError({ name: "NotReadableError" }).code).toBe("CAMERA_IN_USE");
    expect(cameraError(new Error("x")).code).toBe("UNSUPPORTED");
  });
});
