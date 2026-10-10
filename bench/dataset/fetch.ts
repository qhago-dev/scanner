// Descarga el dataset real desde el bucket privado (ADR-12) y verifica sha256 de cada archivo.
// Variables: BENCH_DATASET_URL (base, p. ej. https://<bucket>/qhago-bench/) y BENCH_DATASET_TOKEN (opcional, Bearer).
// Uso: bun run dataset/fetch.ts [--dataset real]
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DATASETS } from "./manifest";

const base = process.env.BENCH_DATASET_URL;
if (!base) {
  console.error(
    "Falta BENCH_DATASET_URL (ver docs/release/acciones-externas.md §6). Sin dataset real se omite.",
  );
  process.exit(0);
}
const headers: Record<string, string> = process.env.BENCH_DATASET_TOKEN
  ? { authorization: `Bearer ${process.env.BENCH_DATASET_TOKEN}` }
  : {};
const manifestPath = DATASETS.real as string;
mkdirSync(dirname(manifestPath), { recursive: true });
const m = await fetch(new URL("manifest.jsonl", base), { headers });
if (!m.ok) throw new Error(`manifest: HTTP ${m.status}`);
writeFileSync(manifestPath, await m.text());

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
let got = 0;
let cached = 0;
for (const line of readFileSync(manifestPath, "utf8").split("\n").filter(Boolean)) {
  const s = JSON.parse(line) as { file: string; sha256: string };
  const dest = join(dirname(manifestPath), s.file);
  if (existsSync(dest) && sha(readFileSync(dest)) === s.sha256) {
    cached++;
    continue;
  }
  const r = await fetch(new URL(s.file, base), { headers });
  if (!r.ok) throw new Error(`${s.file}: HTTP ${r.status}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (sha(bytes) !== s.sha256) throw new Error(`${s.file}: sha256 no coincide`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, bytes);
  got++;
}
console.log(`dataset real: ${got} descargados, ${cached} en caché`);
