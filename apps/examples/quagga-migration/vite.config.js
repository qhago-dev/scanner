import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: { exclude: ["@qhago/scanner"] },
  worker: { format: "es" },
});
