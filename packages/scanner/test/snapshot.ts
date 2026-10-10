// F6.2: snapshot de resultados por sample (formato + texto de cada lectura), compartido por Node (vitest) y Bun.
// Un cambio en el snapshot = cambio de comportamiento del motor; regenerar con UPDATE_SNAPSHOT=1 y revisar el diff.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { DIR_FORMAT, imagesIn, SAMPLES, samplesAvailable } from "./samples";

export const SNAPSHOT = join(import.meta.dirname, "fixtures/samples-snapshot.json");
export const SNAPSHOT_DIRS = samplesAvailable
  ? Object.keys(DIR_FORMAT)
      .flatMap((base) => [1, 2, 3, 4, 5].map((i) => `${base}-${i}`))
      .filter((d) => existsSync(join(SAMPLES, d)))
  : [];

type Decode = (bytes: Uint8Array) => Promise<{ format: string; text: string }[]>;

export async function computeSnapshot(decode: Decode): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const dir of SNAPSHOT_DIRS) {
    for (const s of imagesIn(dir)) {
      const r = await decode(new Uint8Array(readFileSync(s.file)));
      out[relative(SAMPLES, s.file)] = r.map((x) => `${x.format}:${x.text}`).sort();
    }
  }
  return out;
}

export function loadSnapshot(): Record<string, string[]> | null {
  return existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, "utf8")) : null;
}

export function saveSnapshot(s: Record<string, string[]>): void {
  writeFileSync(SNAPSHOT, `${JSON.stringify(s, null, 1)}\n`);
}
