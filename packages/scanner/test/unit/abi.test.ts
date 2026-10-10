// F6.3: un .wasm de otra versión (p. ej. wasmUrl apuntando a un CDN desactualizado) → ENGINE_LOAD_FAILED con la ABI.
import { describe, expect, it } from "vitest";
import { ABI_VERSION, type EngineFactory, instantiate } from "../../src/engine/module";
import { isScanError } from "../../src/errors";

const fakeModule = {} as WebAssembly.Module;

describe("ABI del motor", () => {
  it("ABI distinta → ENGINE_LOAD_FAILED que explica la versión esperada y la cargada", async () => {
    const factory = (async () => ({
      _sa_abi_version: () => ABI_VERSION - 1,
    })) as unknown as EngineFactory;
    const e = await instantiate(factory, fakeModule).catch((x) => x);
    expect(isScanError(e) && e.code).toBe("ENGINE_LOAD_FAILED");
    expect(e.message).toContain(`ABI ${ABI_VERSION}`);
    expect(e.message).toContain(`ABI ${ABI_VERSION - 1}`);
    expect(e.message).toMatch(/wasmUrl/);
  });

  it("fallo al instanciar → ENGINE_LOAD_FAILED con cause", async () => {
    const boom = new Error("LinkError");
    const factory = (async () => {
      throw boom;
    }) as unknown as EngineFactory;
    const e = await instantiate(factory, fakeModule).catch((x) => x);
    expect(isScanError(e) && e.code).toBe("ENGINE_LOAD_FAILED");
    expect(e.cause).toBe(boom);
  });
});
