#!/usr/bin/env node
import { execFileSync } from "node:child_process";
// F6.6: licencias y vulnerabilidades de lo que se publica. Recorre dependencies + peerDependencies (transitivas) de
// cada paquete publicable; falla si alguna licencia no está permitida o si `bun audit` reporta una vulnerabilidad
// high/critical en ese cierre (las de devDependencies se listan como aviso, sin fallar). El código vendorizado (ZXing-C++, stb_image)
// se declara en NOTICE / COMPLIANCE.md.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..");
const PUBLISHED = ["packages/scanner", "packages/ai"];
const ALLOWED = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "Unlicense",
  "CC0-1.0",
  "BlueOak-1.0.0",
]);

const seen = new Map();
let failed = false;

function visit(name, fromDir, via) {
  if (seen.has(name)) return;
  let pkgPath;
  try {
    pkgPath = createRequire(join(fromDir, "package.json")).resolve(`${name}/package.json`);
  } catch {
    // Paquetes sin export de package.json: buscar a mano en node_modules hacia arriba.
    for (let d = fromDir; d !== dirname(d); d = dirname(d)) {
      // Layout de bun: las dependencias son hermanas en .bun/<pkg>/node_modules/.
      const cands = [join(d, "node_modules", name, "package.json"), join(d, name, "package.json")];
      const p = d.endsWith("node_modules")
        ? cands.find(existsSync)
        : existsSync(cands[0])
          ? cands[0]
          : undefined;
      if (p) {
        pkgPath = p;
        break;
      }
    }
  }
  if (!pkgPath) {
    console.error(`✘ ${name}: no instalado (desde ${via})`);
    failed = true;
    return;
  }
  pkgPath = realpathSync(pkgPath);
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const lic = typeof pkg.license === "string" ? pkg.license : (pkg.license?.type ?? "UNKNOWN");
  const ok = lic.split(/\s+OR\s+|[()]/).some((l) => ALLOWED.has(l.trim()));
  seen.set(name, { version: pkg.version, lic, via });
  if (!ok) {
    console.error(`✘ ${name}@${pkg.version}: licencia ${lic} (vía ${via})`);
    failed = true;
  }
  for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }))
    visit(dep, dirname(pkgPath), name);
}

for (const dir of PUBLISHED) {
  const pkg = JSON.parse(readFileSync(join(ROOT, dir, "package.json"), "utf8"));
  if (!ALLOWED.has(pkg.license)) {
    console.error(`✘ ${pkg.name}: licencia propia ${pkg.license}`);
    failed = true;
  }
  for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })) {
    if (dep.startsWith("@qhago/")) continue;
    visit(dep, join(ROOT, dir), pkg.name);
  }
}
for (const [n, i] of seen) console.log(`✔ ${n}@${i.version} ${i.lic} (vía ${i.via})`);

let audit = {};
try {
  audit = JSON.parse(
    execFileSync("bun", ["audit", "--json"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
} catch (e) {
  // bun audit sale con código ≠ 0 si hay hallazgos; el JSON sigue en stdout.
  audit = JSON.parse(e.stdout || "{}");
}
for (const [name, advisories] of Object.entries(audit)) {
  const severe = advisories.filter((a) => a.severity === "high" || a.severity === "critical");
  if (!severe.length) continue;
  if (seen.has(name)) {
    console.error(
      `✘ ${name} (publicado vía ${seen.get(name).via}): ${severe.map((a) => a.url).join(", ")}`,
    );
    failed = true;
  } else {
    console.warn(
      `⚠ ${name} (solo desarrollo): ${severe.map((a) => `${a.severity} ${a.url}`).join(", ")}`,
    );
  }
}
process.exit(failed ? 1 : 0);
