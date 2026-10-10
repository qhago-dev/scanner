import { defineConfig } from "tsup";

// Bundles sin code-splitting ni import() dinámicos (ADR-06: Vite construye workers en iife).
const common = {
  format: ["esm"] as ["esm"],
  target: "es2022",
  sourcemap: true,
  splitting: false,
  treeshake: true,
  dts: false,
  minify: true,
  noExternal: [/qhago_engine/],
};

export default defineConfig([
  {
    ...common,
    entry: {
      index: "src/index.ts",
      worker: "src/worker/worker.ts",
      "worker-host": "src/worker-host.ts",
    },
    outDir: "dist/browser",
    platform: "browser",
    clean: true,
    onSuccess: "node scripts/copy-wasm.mjs --dist",
  },
  {
    ...common,
    entry: { index: "src/index.node.ts" },
    outDir: "dist/node",
    platform: "node",
    clean: true,
  },
]);
