import { defineConfig } from "tsup";

// @qhago/scanner y onnxruntime-web son peers: los resuelve el bundler del usuario.
export default defineConfig({
  entry: { index: "src/index.ts", worker: "src/worker.ts" },
  format: ["esm"],
  target: "es2022",
  platform: "browser",
  sourcemap: true,
  minify: true,
  splitting: true,
  clean: false,
  external: ["@qhago/scanner", /^@qhago\/scanner\//, "onnxruntime-web", /^onnxruntime-web\//],
});
