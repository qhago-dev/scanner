// Acceso a los samples de zxing-cpp preparados (WebP → PNG) y a los umbrales del blackbox upstream.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE = fileURLToPath(new URL("../../engine-wasm/", import.meta.url));
export const SAMPLES = join(ENGINE, "build/samples");
const RUNNER = join(ENGINE, "vendor/zxing-cpp/test/blackbox/BlackboxTestRunner.cpp");

export const samplesAvailable = existsSync(SAMPLES) && existsSync(RUNNER);

/** Directorios de samples → formato nuestro (solo los 13 de 1.0). */
export const DIR_FORMAT: Record<string, string> = {
  aztec: "aztec",
  codabar: "codabar",
  code39: "code_39",
  code93: "code_93",
  code128: "code_128",
  datamatrix: "data_matrix",
  ean8: "ean_8",
  ean13: "ean_13",
  itf: "itf",
  pdf417: "pdf417",
  qrcode: "qr_code",
  upca: "upc_a",
  upce: "upc_e",
};

export interface Threshold {
  dir: string;
  minHarderRot0: number;
}

/** Umbral "tryHarder" a 0° de cada runTests("<dir>", …) del blackbox upstream. */
export function upstreamThresholds(): Threshold[] {
  const src = readFileSync(RUNNER, "utf8");
  const out: Threshold[] = [];
  // Cada sentencia: runTests("dir", FMT, total, { {fast, harder, rot}, … }[, opciones]);
  const re = /runTests\("([a-z0-9-]+)"([\s\S]*?)\);/g;
  for (const m of src.matchAll(re)) {
    const dir = m[1] ?? "";
    const base = dir.replace(/-\d+$/, "");
    if (!(base in DIR_FORMAT) || dir.includes("extension")) continue;
    const rot0 = /\{\s*(\d+),\s*(\d+),\s*0\s*\}/.exec(m[2] ?? "");
    if (rot0) out.push({ dir, minHarderRot0: Number(rot0[2]) });
  }
  return out;
}

export interface Sample {
  file: string;
  /** Texto esperado (.txt) o null. */
  expected: string | null;
  /** Bytes esperados (.bin, contenido binario) o null. */
  expectedBytes: Uint8Array | null;
}

export function imagesIn(dir: string): Sample[] {
  const d = join(SAMPLES, dir);
  return readdirSync(d)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .sort()
    .map((f) => {
      const stem = join(d, f.replace(/\.(png|jpe?g)$/i, ""));
      const bin = join(
        SAMPLES.replace("build/samples", "vendor/zxing-cpp/test/samples"),
        dir,
        `${f.replace(/\.(png|jpe?g)$/i, "")}.bin`,
      );
      return {
        file: join(d, f),
        expected: existsSync(`${stem}.txt`) ? readFileSync(`${stem}.txt`, "utf8") : null,
        expectedBytes: existsSync(bin) ? new Uint8Array(readFileSync(bin)) : null,
      };
    });
}

export function matches(s: Sample, r: { text: string; bytes: Uint8Array }): boolean {
  if (s.expected !== null) return r.text === s.expected || r.text === s.expected.trimEnd();
  if (s.expectedBytes)
    return (
      r.bytes.length === s.expectedBytes.length &&
      r.bytes.every((b, i) => b === s.expectedBytes?.[i])
    );
  return false;
}
