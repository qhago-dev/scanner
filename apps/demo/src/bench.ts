// Benchmark en dispositivo real (F1.8): mismas muestras para cada motor, latencia por imagen y resultados crudos.
import { decode, FORMATS, init } from "@qhago/scanner";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import zxingWasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

interface Line {
  id: string;
  file: string;
  kind: string;
  split: string;
}
type Engine = {
  name: string;
  run: (b: ImageBitmap) => Promise<{ format: string; text: string }[]>;
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const log = (m: string) => {
  $("log").textContent += `${m}\n`;
};

prepareZXingModule({
  overrides: {
    locateFile: (p: string, pre: string) => (p.endsWith(".wasm") ? zxingWasmUrl : pre + p),
  },
});

const engines: Engine[] = [
  {
    name: "qhago",
    run: async (b) =>
      (await decode(b, { formats: FORMATS })).map((r) => ({ format: r.format, text: r.text })),
  },
  {
    name: "zxing-wasm",
    run: async (b) =>
      (await readBarcodes(b as unknown as ImageData, { tryHarder: true, textMode: "Plain" }))
        .filter((r) => r.isValid)
        .map((r) => ({ format: r.format, text: r.text })),
  },
];
const BD = (
  globalThis as {
    BarcodeDetector?: new (
      o: object,
    ) => { detect(s: ImageBitmap): Promise<{ format: string; rawValue: string }[]> };
  }
).BarcodeDetector;
if (BD) {
  const det = new BD({ formats: [...FORMATS] });
  engines.push({
    name: "native",
    run: async (b) => (await det.detect(b)).map((r) => ({ format: r.format, text: r.rawValue })),
  });
}

$("run").onclick = async () => {
  $("log").textContent = "";
  const base = new URL($<HTMLInputElement>("base").value, location.href);
  const split = $<HTMLSelectElement>("split").value;
  const limit = Number($<HTMLInputElement>("limit").value) || Infinity;
  const lines = (await (await fetch(new URL("manifest.jsonl", base))).text())
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Line)
    .filter((l) => l.kind === "image" && l.split === split)
    .slice(0, limit);
  await init();
  log(
    `${lines.length} muestras · motores: ${engines.map((e) => e.name).join(", ")} · ${navigator.userAgent}`,
  );
  const out: Record<
    string,
    { id: string; ms: number; detected: { format: string; text: string }[] }[]
  > = {};
  for (const [i, l] of lines.entries()) {
    const bmp = await createImageBitmap(await (await fetch(new URL(l.file, base))).blob());
    for (const e of engines) {
      if (i < 3) await e.run(bmp); // calentamiento
      const t = performance.now();
      const detected = await e.run(bmp).catch(() => []);
      const list = out[e.name] ?? [];
      out[e.name] = list;
      list.push({ id: l.id, ms: performance.now() - t, detected });
    }
    bmp.close();
    if ((i + 1) % 20 === 0) log(`${i + 1}/${lines.length}`);
  }
  for (const [name, rs] of Object.entries(out)) {
    const ms = rs.map((r) => r.ms).sort((a, b) => a - b);
    log(
      `${name}: p50 ${ms[Math.floor(ms.length / 2)]?.toFixed(1)} ms · p95 ${ms[Math.floor(ms.length * 0.95)]?.toFixed(1)} ms`,
    );
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify({ userAgent: navigator.userAgent, split, results: out })], {
      type: "application/json",
    }),
  );
  a.download = `device-bench-${Date.now()}.json`;
  a.click();
};
