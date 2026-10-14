import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// Versiones instaladas (las de node_modules, no las del package.json): se muestran en el pie.
const version = (pkg: string): string =>
  JSON.parse(readFileSync(new URL(`./node_modules/${pkg}/package.json`, import.meta.url), "utf8"))
    .version;

export default defineConfig({
  // "./" sirve la demo en cualquier subruta; en GitHub Pages se usa DEMO_BASE=/demo/.
  base: process.env.DEMO_BASE ?? "./",
  // ADR-06: sin pre-bundling, para que new URL(…, import.meta.url) (worker, .wasm, modelo) siga funcionando en dev.
  optimizeDeps: { exclude: ["@qhago/scanner", "@qhago/ai", "onnxruntime-web"] },
  // El worker de @qhago/ai carga ONNX Runtime con import() dinámico: necesita workers en formato ES.
  worker: { format: "es" },
  build: { target: "es2022" },
  define: {
    __VERSIONS__: JSON.stringify({
      "@qhago/scanner": version("@qhago/scanner"),
      "@qhago/ai": version("@qhago/ai"),
    }),
  },
});
