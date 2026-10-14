// e2e de la demo contra los paquetes instalados desde npm: archivo, cámara simulada, IA bajo demanda y consola limpia.
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

const CODE = "5901234123457";
const FIXTURE = fileURLToPath(new URL("../public/fixture.png", import.meta.url));
const AI_REQUEST = /\.onnx(\?|$)|\/ort[.-][^/]*$/;

/** Errores de consola y peticiones de IA de la página, para comprobarlos al final de cada prueba. */
function watch(page: Page) {
  const errors: string[] = [];
  const aiRequests: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  // Los workers también cuentan: Playwright emite "request" para sus fetch en la página.
  page.on("requestfinished", (r) => {
    const path = new URL(r.url()).pathname;
    if (AI_REQUEST.test(path)) aiRequests.push(path);
  });
  return { errors, aiRequests };
}

const firstResult = (page: Page) => page.locator(".result-text").first();

test("@smoke archivo: lee el EAN-13 de una foto, sin descargar la IA", async ({ page }) => {
  const w = watch(page);
  await page.goto("./");
  await expect(page.locator("#versions")).toContainText("@qhago/scanner");
  await page.locator("#file").setInputFiles(FIXTURE);
  await expect(firstResult(page)).toHaveText(CODE, { timeout: 30_000 });
  await expect(page.locator(".result a")).toHaveAttribute(
    "href",
    `https://world.openfoodfacts.org/product/${CODE}`,
  );
  expect(w.aiRequests).toEqual([]);
  expect(w.errors).toEqual([]);
});

test("imagen de ejemplo con formatos «Productos»", async ({ page }) => {
  const w = watch(page);
  await page.goto("./");
  await page.locator("#formats").selectOption("products");
  await page.locator("#sample").click();
  await expect(firstResult(page)).toHaveText(CODE, { timeout: 30_000 });
  expect(w.errors).toEqual([]);
});

test("cámara simulada: lee en ≤ 10 s, sin descargar la IA", async ({ page }) => {
  const w = watch(page);
  await page.goto("./");
  await page.locator("#start").click();
  await expect(page.locator("body")).toHaveAttribute("data-state", "scanning", { timeout: 10_000 });
  await expect(firstResult(page)).toHaveText(CODE, { timeout: 10_000 });
  await page.locator("#stop").click();
  await expect(page.locator("body")).toHaveAttribute("data-state", /stopped|destroyed/);
  expect(w.aiRequests).toEqual([]);
  expect(w.errors).toEqual([]);
});

// Con ?ai=always la IA infiere en cada frame aunque el motor clásico lea: así se prueba que ONNX Runtime, el
// modelo y el worker de @qhago/ai cargan y corren (con "fallback" y este fixture nítido, la IA nunca actuaría).
// Sin COOP/COEP (como en GitHub Pages) ORT va en un hilo: el arranque en frío tiene su propio margen (60 s).
test("cámara simulada con IA (always): descarga ORT y el modelo, y lee", async ({ page }) => {
  const w = watch(page);
  await page.goto("./?ai=always");
  await page.locator("#ai").check();
  await page.locator("#start").click();
  await expect(page.locator("#ai-status")).toContainText("IA activa", { timeout: 60_000 });
  await expect(firstResult(page)).toHaveText(CODE, { timeout: 60_000 });
  await expect
    .poll(() => w.aiRequests.some((p) => p.endsWith(".onnx")), { timeout: 60_000 })
    .toBe(true);
  await expect
    .poll(() => w.aiRequests.some((p) => /\/ort-wasm[^/]*\.wasm$/.test(p)), { timeout: 60_000 })
    .toBe(true);
  // Unos frames más con la IA corriendo: cualquier fallo de inferencia llega como "error" → consola.
  await page.waitForTimeout(3000);
  await expect(page.locator("#error")).toBeHidden();
  expect(w.errors).toEqual([]);
});

test("archivo con IA (always)", async ({ page }) => {
  const w = watch(page);
  await page.goto("./?ai=always");
  await page.locator("#ai").check();
  await expect(page.locator("#ai-status")).toContainText("IA activa", { timeout: 30_000 });
  await page.locator("#file").setInputFiles(FIXTURE);
  await expect(firstResult(page)).toHaveText(CODE, { timeout: 60_000 });
  expect(w.aiRequests.some((p) => p.endsWith(".onnx"))).toBe(true);
  expect(w.errors).toEqual([]);
});
