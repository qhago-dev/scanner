// Mismo snapshot que Node: Bun debe leer exactamente lo mismo.
import { describe, expect, it } from "bun:test";
import { configure } from "../../src/config";
import { decode, FORMATS } from "../../src/index.node";
import { computeSnapshot, loadSnapshot, SNAPSHOT_DIRS } from "../snapshot";

configure({ wasmUrl: new URL("../../wasm/qhago_engine_node.wasm", import.meta.url) });

describe.skipIf(!SNAPSHOT_DIRS.length || !loadSnapshot())("snapshot (Bun)", () => {
  it("coincide con el de Node", async () => {
    const got = await computeSnapshot((b) => decode(b, { formats: FORMATS }));
    expect(got).toEqual(loadSnapshot() as Record<string, string[]>);
  }, 300_000);
});
