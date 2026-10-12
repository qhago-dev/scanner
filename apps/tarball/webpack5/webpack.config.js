import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Sin configuración especial para @qhago/scanner (worker y .wasm vía new URL(…, import.meta.url)).
export default {
  entry: "./src/main.js",
  output: { path: resolve(dirname(fileURLToPath(import.meta.url)), "dist"), clean: true },
};
