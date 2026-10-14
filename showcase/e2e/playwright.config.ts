import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

// Por defecto prueba el build (vite preview sobre dist/). E2E_DEV=1 prueba `vite dev` (solo @smoke): es donde
// fallaría un pre-bundling mal configurado (ADR-06).
const dev = process.env.E2E_DEV === "1";
const port = dev ? 5173 : 4173;
// Con DEMO_BASE (p. ej. /demo/) se prueba el build servido bajo esa subruta, como en GitHub Pages.
const base = process.env.DEMO_BASE ?? "/";
const video = fileURLToPath(new URL("./.cache/fixture.y4m", import.meta.url));

export default defineConfig({
  testDir: ".",
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  ...(dev ? { grep: /@smoke/ } : {}),
  use: {
    baseURL: `http://127.0.0.1:${port}${base}`,
    browserName: "chromium",
    permissions: ["camera"],
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-video-capture=${video}`,
      ],
    },
  },
  webServer: {
    command: dev
      ? `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`
      : `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}${base}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
