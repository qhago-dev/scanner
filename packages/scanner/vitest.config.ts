/// <reference types="@vitest/browser/providers/playwright" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
      reporter: ["text-summary", "json-summary"],
      // F6.1: medido sobre node + browser (Chromium) + camera; los workers se cubren vía puerto falso.
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
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
          setupFiles: ["test/camera/fake-camera.ts"],
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
              // Firefox: shim de getUserMedia con canvas.captureStream (test/camera/fake-camera.ts).
              ...(process.env.QHAGO_CAMERA_FIREFOX === "0"
                ? []
                : [{ browser: "firefox" as const }]),
              // WebKit: experimental. En Linux, play() sobre canvas.captureStream no arranca (limitación de Playwright).
              ...(process.env.QHAGO_CAMERA_WEBKIT === "1" ? [{ browser: "webkit" as const }] : []),
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
