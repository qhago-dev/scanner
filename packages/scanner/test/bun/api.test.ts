// Suite mínima que verifica el runtime Bun (ADR-10): el resto de tests corre en Vitest.
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { configure } from "../../src/config";
import { decode } from "../../src/index.node";

configure({ wasmUrl: new URL("../../wasm/qhago_engine_node.wasm", import.meta.url) });
const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url));

describe("decode() en Bun", () => {
  it("lee PNG desde Buffer", async () => {
    const [r] = await decode(fx("ean13-synthetic.png"));
    expect(r?.format).toBe("ean_13");
    expect(r?.text).toBe("5901234123457");
  });
  it("lee Code128 desde Blob", async () => {
    const [r] = await decode(new Blob([fx("code128-synthetic.png")]));
    expect(r?.text).toBe("HELLO-WORLD");
  });
  it("rechaza WebP con INVALID_INPUT", async () => {
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    await expect(decode(webp)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
