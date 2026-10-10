/// <reference types="@vitest/browser/providers/playwright" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: { name: "node", include: ["test/unit/**/*.test.ts"], environment: "node" },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["test/browser/**/*.test.ts"],
          testTimeout: 120_000,
          browser: {
            enabled: true,
            provider: "playwright",
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
  optimizeDeps: { exclude: ["onnxruntime-web", "@qhago/scanner"] },
});
