// Guarda de splits (F10.1): `test` exige motivo; `holdout` exige motivo y --holdout-ok (fricción deliberada, no
// seguridad). Toda ejecución sobre test/holdout queda registrada en results/{test,holdout}-runs.md.
import { execSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SPLITS = ["dev", "test", "holdout"] as const;
export type Split = (typeof SPLITS)[number];

export interface GuardInput {
  split: string;
  reason?: string;
  holdoutOk?: boolean;
  runner: string;
  dataset: string;
  engines: string;
  /** Carpeta del registro (para logRun en tests; guardSplit usa siempre bench/results). */
  out?: string;
}

/** Los registros de test/holdout viven siempre aquí, aunque el reporte se escriba con --out en otra carpeta. */
export const RUNS_DIR = join(import.meta.dir, "results");

/** Devuelve el mensaje de error o null si la ejecución está permitida. */
export function checkSplit(g: Pick<GuardInput, "split" | "reason" | "holdoutOk">): string | null {
  if (!(SPLITS as readonly string[]).includes(g.split))
    return `--split debe ser ${SPLITS.join(" | ")} (recibido "${g.split}")`;
  if (g.split === "test" && !g.reason)
    return "--split test exige --reason (test solo para gates y cierres, y cada ejecución se registra).";
  if (g.split === "holdout" && (!g.reason || !g.holdoutOk))
    return "--split holdout exige --reason y --holdout-ok (holdout solo para la release; se registra aparte).";
  return null;
}

export function commitId(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

/** Registra la ejecución si el split lo requiere. */
export function logRun(g: GuardInput, date = new Date().toISOString().slice(0, 10)): string | null {
  if (g.split === "dev") return null;
  const dir = g.out ?? RUNS_DIR;
  const log = join(dir, `${g.split}-runs.md`);
  mkdirSync(dir, { recursive: true });
  if (!existsSync(log))
    writeFileSync(
      log,
      `# Ejecuciones sobre el split ${g.split}\n\n| Fecha | Commit | Dataset | Motores | Motivo | Runner |\n|---|---|---|---|---|---|\n`,
    );
  appendFileSync(
    log,
    `| ${date} | ${commitId()} | ${g.dataset} | ${g.engines} | ${g.reason} | ${g.runner} |\n`,
  );
  return log;
}

/** Comprueba y registra; sale con código 2 si no está permitido. */
export function guardSplit(g: GuardInput): void {
  const err = checkSplit(g);
  if (err) {
    console.error(err);
    process.exit(2);
  }
  logRun({ ...g, out: RUNS_DIR });
}
