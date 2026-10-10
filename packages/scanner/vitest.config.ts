import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
      reporter: ["text-summary", "json-summary"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["test/unit/**/*.test.ts", "test/integration/**/*.test.ts"],
          setupFiles: ["test/setup-node.ts"],
          testTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["test/browser/**/*.test.ts"],
          testTimeout: 60_000,
          browser: {
            enabled: true,
            provider: "playwright",
            headless: true,
            instances: (process.env.QHAGO_BROWSERS ?? "chromium,firefox,webkit")
              .split(",")
              .map((browser) => ({ browser: browser as "chromium" | "firefox" | "webkit" })),
          },
        },
      },
    ],
  },
});
