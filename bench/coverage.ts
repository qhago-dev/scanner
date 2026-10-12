// Cobertura de un dataset frente a los mínimos de captura (F10.4). Solo imprime conteos (nunca textos de códigos).
// bun run coverage.ts --dataset device|public [--strict]   (--strict: exit 1 si algún mínimo no se cumple)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadManifest, type Sample } from "./dataset/manifest";

const { values: a } = parseArgs({
  options: {
    dataset: { type: "string", default: "device" },
    strict: { type: "boolean", default: false },
  },
});

interface Targets {
  splits: string[];
  objectsByFormat: Record<string, number>;
  negatives: number;
  samplesPerScenario: number;
}

export interface CoverageRow {
  split: string;
  what: string;
  have: number;
  need: number;
}

/** Filas de cobertura: objetos con código por grupo de formatos, negativas y muestras por escenario. */
export function coverage(samples: Sample[], t: Targets): CoverageRow[] {
  const rows: CoverageRow[] = [];
  for (const split of t.splits) {
    const ss = samples.filter((s) => s.split === split);
    for (const [group, need] of Object.entries(t.objectsByFormat)) {
      const fmts = group.split("|");
      const objs = new Set(
        ss.filter((s) => s.codes.some((c) => fmts.includes(c.format))).map((s) => s.object),
      );
      rows.push({ split, what: `objetos ${fmts.join("/")}`, have: objs.size, need });
    }
    rows.push({
      split,
      what: "negativas",
      have: ss.filter((s) => s.codes.length === 0).length,
      need: t.negatives,
    });
    const scen = new Map<string, number>();
    for (const s of ss.filter((x) => x.codes.length))
      for (const sc of s.scenarios) scen.set(sc, (scen.get(sc) ?? 0) + 1);
    for (const [sc, n] of [...scen].sort())
      rows.push({ split, what: `muestras escenario ${sc}`, have: n, need: t.samplesPerScenario });
  }
  return rows;
}

if (import.meta.main) {
  const t = JSON.parse(
    readFileSync(join(import.meta.dir, "dataset/targets.json"), "utf8"),
  ) as Targets;
  const rows = coverage(loadManifest(a.dataset ?? "device"), t);
  console.log(
    `# Cobertura — ${a.dataset}\n\n| Split | Qué | Hay | Mínimo | |\n|---|---|---|---|---|`,
  );
  for (const r of rows)
    console.log(
      `| ${r.split} | ${r.what} | ${r.have} | ${r.need} | ${r.have >= r.need ? "ok" : "FALTA"} |`,
    );
  const missing = rows.filter((r) => r.have < r.need);
  if (missing.length) {
    console.log(
      `\n${missing.length} mínimos sin cumplir: los veredictos con IC por objeto no son interpretables todavía` +
        " (ver docs/guias/captura-device.md).",
    );
    if (a.strict) process.exit(1);
  }
}
