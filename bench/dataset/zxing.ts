// Genera bench/dataset/zxing/manifest.jsonl desde los samples de zxing-cpp (WebP ya convertidos a PNG).
// Es un set de REGRESIÓN (no representa cámaras reales): no sirve para los gates G2/G3/G5.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLES = join(HERE, "../../packages/engine-wasm/build/samples");
const ORIG = join(HERE, "../../packages/engine-wasm/vendor/zxing-cpp/test/samples");
const OUT = join(HERE, "zxing");
const DIR_FORMAT: Record<string, string> = {
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

if (!existsSync(SAMPLES)) {
  console.error("Faltan los samples: python3 -I packages/engine-wasm/test/prepare-samples.py …");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
const lines: string[] = [];
for (const dir of readdirSync(SAMPLES).sort()) {
  const base = dir.replace(/-\d+$/, "");
  const negative = base === "falsepositives";
  const format = DIR_FORMAT[base];
  if (!format && !negative) continue;
  if (dir.includes("extension")) continue;
  for (const f of readdirSync(join(SAMPLES, dir))
    .filter((x) => /\.(png|jpe?g)$/i.test(x))
    .sort()) {
    const path = join(SAMPLES, dir, f);
    const stem = f.replace(/\.(png|jpe?g)$/i, "");
    const txt = join(SAMPLES, dir, `${stem}.txt`);
    if (!negative && !existsSync(txt)) continue; // .bin (binario) no se compara como texto aquí
    if (existsSync(join(ORIG, dir, `${stem}.bin`))) continue;
    const bytes = readFileSync(path);
    lines.push(
      JSON.stringify({
        id: `zxing-${dir}-${stem}`,
        file: relative(OUT, path),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        kind: "image",
        codes: negative ? [] : [{ format, text: readFileSync(txt, "utf8") }],
        complete: negative,
        scenarios: [negative ? "negative" : "zxing-regression"],
        source: "zxing-cpp/test/samples",
        license: "Apache-2.0",
        object: `${dir}/${stem}`,
        split: "dev",
      }),
    );
  }
}
writeFileSync(join(OUT, "manifest.jsonl"), `${lines.join("\n")}\n`);
console.log(`${lines.length} muestras → ${join(OUT, "manifest.jsonl")}`);
