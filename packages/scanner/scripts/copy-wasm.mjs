// Copia los artefactos de packages/engine-wasm/out a wasm/ (fuente para tsup) y a dist/ (assets junto al JS).
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkg = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(pkg, "..", "engine-wasm", "out");
const files = [
  ["browser/qhago_engine.mjs", "qhago_engine.mjs"],
  ["browser/qhago_engine.wasm", "qhago_engine.wasm"],
  ["node/qhago_engine_node.mjs", "qhago_engine_node.mjs"],
  ["node/qhago_engine_node.wasm", "qhago_engine_node.wasm"],
];
for (const [src] of files) {
  if (!existsSync(join(out, src))) {
    console.error(`Falta ${src}. Ejecuta antes: bun run build:wasm`);
    process.exit(1);
  }
}
// wasm/: todo (fuente del glue para tsup + assets para self-hosting vía "@qhago/scanner/wasm/*").
// dist/<plataforma>/: solo el .wasm que esa plataforma resuelve con new URL(..., import.meta.url).
const plan = process.argv.includes("--dist")
  ? [
      ["dist/browser", ["qhago_engine.wasm"]],
      ["dist/node", ["qhago_engine_node.wasm"]],
    ]
  : [["wasm", files.map(([, d]) => d)]];
for (const [dir, names] of plan) {
  mkdirSync(join(pkg, dir), { recursive: true });
  for (const [src, dst] of files)
    if (names.includes(dst)) cpSync(join(out, src), join(pkg, dir, dst));
}
console.log(`wasm copiado a ${plan.map(([d]) => d).join(", ")}`);
