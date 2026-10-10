import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { FORMATS } from "@qhago/scanner";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { type Detected, type Engine, type FrameInput, normFormat } from "./types";

const require = createRequire(import.meta.url);

export function zxingWasmEngine(): Engine {
  const pkgPath = require.resolve("zxing-wasm/package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
  return {
    name: "zxing-wasm",
    version: pkg.version,
    supports: FORMATS,
    notes:
      "readBarcodes con tryHarder y textMode Plain (igual que qhago), todos los formatos; se filtran a los 13 de 1.0",
    async init() {
      const wasmBinary = readFileSync(join(dirname(pkgPath), "dist/reader/zxing_reader.wasm"));
      await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
    },
    async decode({ rgba }: FrameInput): Promise<Detected[]> {
      const out = await readBarcodes(
        {
          data: rgba.data,
          width: rgba.width,
          height: rgba.height,
          colorSpace: "srgb",
        } as unknown as ImageData,
        { tryHarder: true, textMode: "Plain" },
      );
      return out
        .filter((b) => b.isValid)
        .map((b) => ({ format: normFormat(b.format), text: b.text }))
        .filter((d): d is Detected => d.format !== null);
    },
    async dispose() {},
  };
}
