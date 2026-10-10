import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Sin configuración especial: webpack 5 trata new URL(…, import.meta.url) y new Worker(new URL(…)) como assets/chunks.
export default {
  entry: "./src/main.js",
  output: { path: resolve(dirname(fileURLToPath(import.meta.url)), "dist"), clean: true },
  experiments: { topLevelAwait: true },
};
