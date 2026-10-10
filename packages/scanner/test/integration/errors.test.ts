// F4.2: toda API pública (Node) rechaza con ScanError y un código estable; nunca con TypeError/Error genérico.
import { describe, expect, it } from "vitest";
import { createScanner, decode, init, isScanError, type ScanErrorCode } from "../../src/index.node";

async function code(p: () => unknown): Promise<ScanErrorCode | string> {
  try {
    await p();
    return "no-throw";
  } catch (e) {
    if (!isScanError(e)) return `no-ScanError: ${String(e)}`;
    expect(e.docsUrl).toMatch(/^https:\/\/qhago\.dev\/docs\/errors#[a-z-]+$/);
    return e.code;
  }
}

describe("errores tipados", () => {
  it.each<[string, () => unknown, ScanErrorCode]>([
    ["input null", () => decode(null as never), "INVALID_INPUT"],
    ["input número", () => decode(42 as never), "INVALID_INPUT"],
    ["objeto cualquiera", () => decode({ foo: 1 } as never), "INVALID_INPUT"],
    ["bytes basura", () => decode(new Uint8Array([1, 2, 3, 4])), "INVALID_INPUT"],
    [
      "RawImage con tamaño incoherente",
      () => decode({ data: new Uint8Array(10), width: 100, height: 100, format: "luma" }),
      "INVALID_INPUT",
    ],
    [
      "formato desconocido",
      () => decode(new Uint8Array(8), { formats: ["foo" as never] }),
      "INVALID_INPUT",
    ],
    [
      "strategy inválida",
      () => decode(new Uint8Array(8), { strategy: "x" as never }),
      "INVALID_INPUT",
    ],
    [
      "región negativa",
      () =>
        decode(
          { data: new Uint8Array(100), width: 10, height: 10, format: "luma" },
          { region: { x: -1, y: 0, width: 5, height: 5 } },
        ),
      "INVALID_INPUT",
    ],
    [
      "signal abortada",
      () => decode(new Uint8Array(8), { signal: AbortSignal.abort() }),
      "ABORTED",
    ],
    ["init con signal abortada", () => init({ signal: AbortSignal.abort() }), "ABORTED"],
    ["createScanner en Node", () => createScanner(), "UNSUPPORTED"],
  ])("%s", async (_n, fn, expected) => {
    expect(await code(fn)).toBe(expected);
  });
});
