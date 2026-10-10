// SSR-safe (ADR-06): importar la entrada de navegador en Node sin DOM no debe lanzar ni tocar window/document.
import { describe, expect, it } from "vitest";

describe("SSR", () => {
  it("importar src/index.ts (navegador) en Node no falla", async () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
    const mod = await import("../../src/index");
    expect(typeof mod.decode).toBe("function");
    expect(typeof mod.init).toBe("function");
  });
});
