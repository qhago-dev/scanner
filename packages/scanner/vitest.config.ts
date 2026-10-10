/// <reference types="@vitest/browser/providers/playwright" />
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
          name: "camera",
          include: ["test/camera/**/*.test.ts"],
          testTimeout: 60_000,
          browser: {
            enabled: true,
            provider: "playwright",
            headless: true,
            instances: [
              {
                browser: "chromium",
                launch: {
                  args: [
                    "--use-fake-ui-for-media-stream",
                    "--use-fake-device-for-media-stream",
                    `--use-file-for-fake-video-capture=${new URL("./test/.cache/ean13-moving.y4m", import.meta.url).pathname}`,
                  ],
                },
                context: { permissions: ["camera"] },
              },
            ],
          },
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
