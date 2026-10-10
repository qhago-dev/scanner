import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { BarcodeFormat } from "@qhago/scanner";
import {
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
  BarcodeFormat as ZF,
} from "@zxing/library";
import { toLuma } from "../image";
import { type Detected, type Engine, type FrameInput, normFormat } from "./types";

const require = createRequire(import.meta.url);
const SUPPORTED: BarcodeFormat[] = [
  "aztec",
  "codabar",
  "code_39",
  "code_93",
  "code_128",
  "data_matrix",
  "ean_8",
  "ean_13",
  "itf",
  "pdf417",
  "qr_code",
  "upc_a",
  "upc_e",
];

export function zxingJsEngine(): Engine {
  const pkg = JSON.parse(readFileSync(require.resolve("@zxing/library/package.json"), "utf8")) as {
    version: string;
  };
  const reader = new MultiFormatReader();
  return {
    name: "zxing-js",
    version: pkg.version,
    supports: SUPPORTED,
    notes: "MultiFormatReader + HybridBinarizer, TRY_HARDER; lee 1 código por imagen",
    async init() {
      const hints = new Map();
      hints.set(DecodeHintType.TRY_HARDER, true);
      reader.setHints(hints);
    },
    async decode({ rgba }: FrameInput): Promise<Detected[]> {
      try {
        const src = new RGBLuminanceSource(toLuma(rgba), rgba.width, rgba.height);
        const r = reader.decodeWithState(new BinaryBitmap(new HybridBinarizer(src)));
        const f = normFormat(ZF[r.getBarcodeFormat()] ?? "");
        return f ? [{ format: f, text: r.getText() }] : [];
      } catch {
        return [];
      } finally {
        reader.reset();
      }
    },
    async dispose() {},
  };
}
