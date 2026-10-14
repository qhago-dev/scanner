#!/usr/bin/env node
// F12: el peer de @qhago/ai sobre @qhago/scanner debe admitir la versión actual de scanner y, antes de la 1.0, las
// del camino previsto (0.1.0-rc, 1.0.0-beta, 1.0.0-rc, 1.0.0). En semver una prerelease solo satisface un rango si algún
// comparador tiene el mismo x.y.z con prerelease: un rango mal escrito hace que `npm i` falle con ERESOLVE.
// Además, el plan de changesets no debe subir @qhago/ai de major por arrastre (dependiente por peer) sin un
// changeset propio: por defecto changesets lo hace aunque la versión nueva siga en rango.
// Corre en CI (job license), en Release antes de publicar y en `release`/`release:dry`.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import semver from "semver";

const ROOT = join(import.meta.dirname, "..");
const pkg = (p) => JSON.parse(readFileSync(join(ROOT, p, "package.json"), "utf8"));
const scanner = pkg("packages/scanner").version;
const range = pkg("packages/ai").peerDependencies?.["@qhago/scanner"];
if (!range) throw new Error("packages/ai no declara @qhago/scanner en peerDependencies");

const required = [scanner];
if (semver.lt(scanner, "1.0.0")) required.push("0.1.0-rc.0", "1.0.0-beta.0", "1.0.0-rc.0", "1.0.0");
const outside = required.filter((v) => !semver.satisfies(v, range));
if (outside.length) {
  console.error(
    `✗ El peer de @qhago/ai ("@qhago/scanner": "${range}") no admite ${outside.join(", ")}.\n` +
      "  npm fallaría con ERESOLVE al instalar ambos. Amplía el rango en packages/ai/package.json (ver" +
      " docs/roadmap-v1/fase-12-peer-ai/disenio.md, D1) y publica @qhago/ai.",
  );
  process.exit(1);
}
console.log(`✓ peer de @qhago/ai "${range}" admite ${required.join(", ")}`);

// Plan de changesets (si no hay changesets pendientes, `changeset status` falla y no hay plan que comprobar).
const dir = mkdtempSync(join(tmpdir(), "check-peer-"));
let status = null;
try {
  const file = join(dir, "status.json");
  execFileSync("bunx", ["changeset", "status", `--output=${file}`], { cwd: ROOT, stdio: "pipe" });
  status = JSON.parse(readFileSync(file, "utf8"));
} catch {
  console.log("· sin plan de changesets que comprobar");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
if (status) {
  const ai = status.releases.find((r) => r.name === "@qhago/ai");
  const own = status.changesets.some((c) =>
    c.releases.some((r) => r.name === "@qhago/ai" && r.type === "major"),
  );
  if (ai?.type === "major" && !own) {
    console.error(
      `✗ changesets subiría @qhago/ai a ${ai.newVersion} por arrastre de @qhago/scanner, sin changeset propio.\n` +
        "  Revisa onlyUpdatePeerDependentsWhenOutOfRange en .changeset/config.json y el rango del peer.",
    );
    process.exit(1);
  }
  console.log(`✓ plan de changesets: @qhago/ai ${ai ? `→ ${ai.newVersion}` : "sin cambios"}`);
}
