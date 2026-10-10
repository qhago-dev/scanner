// bun run bench -- --dataset synthetic|zxing|real|<ruta> --split dev|test --engines qhago,zxing-wasm,zxing-js,quagga2
//                  [--limit N] [--reason "…"] [--out bench/results]
import { execSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadManifest } from "./dataset/manifest";
import { qhagoEngine } from "./engines/qhago";
import { qhagoAiEngine } from "./engines/qhago-ai";
import { quagga2Engine } from "./engines/quagga2";
import type { Engine } from "./engines/types";
import { zxingJsEngine } from "./engines/zxing-js";
import { zxingWasmEngine } from "./engines/zxing-wasm";
import { loadRgba } from "./image";
import type { SampleRun } from "./metrics";
import { buildReport } from "./report";

const { values: a } = parseArgs({
  options: {
    dataset: { type: "string", default: "synthetic" },
    split: { type: "string", default: "dev" },
    engines: { type: "string", default: "qhago,zxing-wasm,zxing-js,quagga2" },
    kind: { type: "string", default: "image" },
    limit: { type: "string" },
    reason: { type: "string" },
    out: { type: "string", default: join(import.meta.dir, "results") },
  },
});

const FACTORIES: Record<string, () => Engine> = {
  qhago: () => qhagoEngine("balanced"),
  "qhago-fast": () => qhagoEngine("fast"),
  "qhago-thorough": () => qhagoEngine("thorough"),
  "qhago+ai": () => qhagoAiEngine(),
  "qhago+ai-always": () => qhagoAiEngine(undefined, "always"),
  "zxing-wasm": zxingWasmEngine,
  "zxing-js": zxingJsEngine,
  quagga2: quagga2Engine,
};

if (a.kind !== "image") {
  console.error(
    "--kind video: el runner de vídeo usa la fusión multi-frame de F3 (bench/runners/video.ts).",
  );
  process.exit(2);
}
if (a.split === "test" && !a.reason) {
  console.error(
    "--split test exige --reason (F1: test solo para gates y RCs, y cada ejecución se registra).",
  );
  process.exit(2);
}

const all = loadManifest(a.dataset).filter((s) => s.split === a.split && s.kind === "image");
const samples = a.limit ? all.slice(0, Number(a.limit)) : all;
if (!samples.length) {
  console.error(`Sin muestras en ${a.dataset}/${a.split}`);
  process.exit(1);
}
const engines = (a.engines ?? "").split(",").map((n) => {
  const f = FACTORIES[n.trim()];
  if (!f)
    throw new Error(`Motor desconocido: ${n}. Disponibles: ${Object.keys(FACTORIES).join(", ")}`);
  return f();
});
for (const e of engines) await e.init();

const runs = new Map<string, SampleRun[]>(engines.map((e) => [e.name, []]));
const t0 = performance.now();
for (const [i, s] of samples.entries()) {
  const rgba = loadRgba(s.path);
  for (const e of engines) {
    if (i < 3) await e.decode({ rgba, path: s.path }); // calentamiento (no se registra)
    const t = performance.now();
    try {
      const detected = await e.decode({ rgba, path: s.path });
      runs.get(e.name)?.push({ sample: s, detected, ms: performance.now() - t });
    } catch (err) {
      runs
        .get(e.name)
        ?.push({ sample: s, detected: [], ms: performance.now() - t, error: String(err) });
    }
  }
  if ((i + 1) % 50 === 0)
    console.error(
      `  ${i + 1}/${samples.length} (${((performance.now() - t0) / 1000).toFixed(0)} s)`,
    );
}
for (const e of engines) await e.dispose();

const commit = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
})();
const date = new Date().toISOString().slice(0, 10);
const meta = {
  dataset: a.dataset ?? "",
  split: a.split ?? "",
  date,
  commit,
  cpu: cpus()[0]?.model ?? "?",
  runtime: `Bun ${Bun.version}`,
  ...(a.reason ? { reason: a.reason } : {}),
};
const { markdown, json } = buildReport(meta, engines, runs);
const out = a.out ?? "results";
mkdirSync(out, { recursive: true });
const name = `${date}-${commit}-${a.dataset}-${a.split}`;
writeFileSync(join(out, `${name}.md`), markdown);
writeFileSync(join(out, `${name}.json`), JSON.stringify(json, null, 2));
if (a.split === "test") {
  const log = join(out, "test-runs.md");
  if (!existsSync(log))
    writeFileSync(
      log,
      "# Ejecuciones sobre el split test\n\n| Fecha | Commit | Dataset | Motores | Motivo |\n|---|---|---|---|---|\n",
    );
  appendFileSync(log, `| ${date} | ${commit} | ${a.dataset} | ${a.engines} | ${a.reason} |\n`);
}
console.log(markdown);
console.error(`→ ${join(out, `${name}.md`)}`);
