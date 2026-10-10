import { defineConfig } from "vite";

export default defineConfig({
  // ADR-06: sin pre-bundling, para que new URL(…, import.meta.url) (worker, .wasm, modelo) siga funcionando.
  optimizeDeps: { exclude: ["@qhago/scanner", "@qhago/ai", "onnxruntime-web"] },
  // El worker de @qhago/ai carga ONNX Runtime con import() dinámico: necesita workers en formato ES.
  worker: { format: "es" },
  build: { target: "es2022" },
});
