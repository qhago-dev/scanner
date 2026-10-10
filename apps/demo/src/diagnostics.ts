import { getEnvironmentReport } from "@qhago/scanner";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const report = await getEnvironmentReport();
const text = JSON.stringify(report, null, 2);
$("report").textContent = text;
$("copy").addEventListener("click", () => void navigator.clipboard.writeText(text));

interface NativeDetector {
  detect(
    src: ImageBitmapSource,
  ): Promise<{ format: string; rawValue: string; cornerPoints: { x: number; y: number }[] }[]>;
}
const BD = (
  globalThis as {
    BarcodeDetector?: {
      new (o?: { formats: string[] }): NativeDetector;
      getSupportedFormats(): Promise<string[]>;
    };
  }
).BarcodeDetector;

$<HTMLInputElement>("files").addEventListener("change", async (e) => {
  const out = $("native");
  if (!BD) {
    out.textContent = "Este navegador no tiene BarcodeDetector nativo.";
    return;
  }
  const det = new BD({ formats: await BD.getSupportedFormats() });
  for (const file of (e.target as HTMLInputElement).files ?? []) {
    const bmp = await createImageBitmap(file);
    const results = (await det.detect(bmp)).map((r) => ({
      format: r.format,
      rawValue: r.rawValue,
      cornerPoints: r.cornerPoints,
    }));
    const fx = { image: file.name, ua: navigator.userAgent, results };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(fx, null, 2)], { type: "application/json" }),
    );
    a.download = `${file.name.replace(/\.[^.]+$/, "")}.${/Android/.test(navigator.userAgent) ? "android" : "macos"}.json`;
    a.click();
    out.textContent += `${file.name}: ${results.length} códigos\n`;
  }
});
