import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  // ADR-06: en modo dev, el pre-bundling reubica el paquete y rompe new URL(…, import.meta.url).
  optimizeDeps: { exclude: ["@qhago/scanner"] },
  worker: { format: "es" },
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        collect: resolve(import.meta.dirname, "collect.html"),
        bench: resolve(import.meta.dirname, "bench.html"),
        diagnostics: resolve(import.meta.dirname, "diagnostics.html"),
      },
    },
  },
  server: { host: true },
});
