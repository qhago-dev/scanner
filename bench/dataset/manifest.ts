import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BarcodeFormat } from "@qhago/scanner";

export interface ExpectedCode {
  format: BarcodeFormat;
  text: string;
  corners?: [number, number][];
  firstVisibleMs?: number;
}

export interface Sample {
  id: string;
  file: string;
  sha256: string;
  kind: "image" | "video";
  codes: ExpectedCode[];
  complete: boolean;
  scenarios: string[];
  device?: string;
  resolution?: [number, number];
  fps?: number;
  source: string;
  license: string;
  object: string;
  split: "dev" | "test" | "holdout";
  /** Ruta absoluta (resuelta al cargar). */
  path: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
export const DATASETS: Record<string, string> = {
  real: join(HERE, "real/manifest.jsonl"),
  /** Datasets públicos reales (ArTe-Lab, KAIST, Muenster): public/fetch.sh + public/import.py. */
  public: join(HERE, "public/manifest.jsonl"),
  /** Fotos reales del modo depuración con veredicto manual (privado): device/build.py. */
  device: join(HERE, "device/manifest.jsonl"),
  synthetic: join(HERE, "synthetic/out/manifest.jsonl"),
  "synthetic-video": join(HERE, "synthetic/out/manifest-video.jsonl"),
  zxing: join(HERE, "zxing/manifest.jsonl"),
};

const REQUIRED = [
  "id",
  "file",
  "sha256",
  "kind",
  "codes",
  "complete",
  "scenarios",
  "source",
  "license",
  "object",
  "split",
];

/** Carga y valida (campos obligatorios y tipos básicos; el esquema completo está en manifest.schema.json). */
export function loadManifest(nameOrPath: string): Sample[] {
  const p = DATASETS[nameOrPath] ?? resolve(nameOrPath);
  if (!existsSync(p)) throw new Error(`No existe el manifest ${p}`);
  const base = dirname(p);
  return readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l, i) => {
      const s = JSON.parse(l) as Sample;
      for (const k of REQUIRED) if (!(k in s)) throw new Error(`${p}:${i + 1}: falta "${k}"`);
      if (!["dev", "test", "holdout"].includes(s.split))
        throw new Error(`${p}:${i + 1}: split inválido`);
      return { ...s, path: join(base, s.file) };
    });
}
