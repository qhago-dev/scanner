// Graba las diapositivas (PNG 1920×1080) y la demo en vivo (WebM) para el vídeo. Requiere `vite preview` en BASE.
import { mkdirSync, readdirSync, readFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE ?? "http://localhost:4719";
const OUT = join(HERE, "out");
const SCANNER = join(HERE, "../../../packages/scanner");
const durations = JSON.parse(readFileSync(join(OUT, "durations.json"), "utf8"));
const guion = JSON.parse(readFileSync(join(HERE, "guion.json"), "utf8"));
mkdirSync(join(OUT, "shots"), { recursive: true });
mkdirSync(join(OUT, "live"), { recursive: true });

const browser = await chromium.launch({
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-video-capture=${join(SCANNER, "test/.cache/ean13-moving.y4m")}`,
  ],
});
const size = { width: 1920, height: 1080 };

const ctx = await browser.newContext({ viewport: size });
const page = await ctx.newPage();
for (const { slide, live } of guion) {
  if (live) continue;
  await page.goto(`${BASE}/presentacion.html#${slide}`);
  await page.reload();
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, "shots", `${String(slide).padStart(2, "0")}.png`) });
}
await ctx.close();

// Demo en vivo: la acción sigue la narración (imagen al ~1 s, cámara a mitad).
for (const { slide } of guion.filter((g) => g.live)) {
  const live = await browser.newContext({
    viewport: size,
    permissions: ["camera"],
    recordVideo: { dir: join(OUT, "live"), size },
  });
  const p = await live.newPage();
  await p.goto(`${BASE}/presentacion.html#${slide}`);
  await p.waitForTimeout(1200);
  await p.setInputFiles("#file", join(SCANNER, "test/fixtures/ean13-synthetic.png"));
  await p.waitForTimeout(Math.max(2500, durations[slide] * 400));
  await p.click("#cam");
  await p.waitForTimeout(durations[slide] * 1000);
  await live.close();
  const f = readdirSync(join(OUT, "live")).find(
    (n) => n.endsWith(".webm") && !n.startsWith("slide"),
  );
  if (f)
    renameSync(
      join(OUT, "live", f),
      join(OUT, "live", `slide${String(slide).padStart(2, "0")}.webm`),
    );
}
await browser.close();
console.log("grabado →", OUT);
