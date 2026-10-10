import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import Quagga from "@ericblade/quagga2";
import type { BarcodeFormat } from "@qhago/scanner";
import { type Detected, type Engine, type FrameInput, normFormat } from "./types";

const require = createRequire(import.meta.url);
const READERS = [
  "code_128_reader",
  "ean_reader",
  "ean_8_reader",
  "code_39_reader",
  "code_93_reader",
  "codabar_reader",
  "upc_reader",
  "upc_e_reader",
  "i2of5_reader",
];
const SUPPORTED: BarcodeFormat[] = [
  "code_128",
  "ean_13",
  "ean_8",
  "code_39",
  "code_93",
  "codabar",
  "upc_a",
  "upc_e",
  "itf",
];

export function quagga2Engine(): Engine {
  const pkg = JSON.parse(
    readFileSync(require.resolve("@ericblade/quagga2/package.json"), "utf8"),
  ) as { version: string };
  return {
    name: "quagga2",
    version: pkg.version,
    supports: SUPPORTED,
    notes:
      "decodeSingle con locate:true, size 800, todos sus readers 1D; en Node solo acepta rutas (incluye su propio decode de la imagen)",
    async init() {},
    decode({ path }: FrameInput): Promise<Detected[]> {
      if (!path) return Promise.resolve([]);
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve([]), 10_000);
        Quagga.decodeSingle(
          {
            src: path,
            numOfWorkers: 0,
            locate: true,
            inputStream: { size: 800 },
            decoder: { readers: READERS as never },
          },
          (res) => {
            clearTimeout(timer);
            const code = res?.codeResult?.code;
            const f = res?.codeResult?.format ? normFormat(res.codeResult.format) : null;
            resolve(code && f ? [{ format: f, text: code }] : []);
          },
        );
      });
    },
    async dispose() {},
  };
}
