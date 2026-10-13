// Publicación en un comando (F7.4).
//
//   bun run release          comprueba, versiona (changeset version), commitea y hace push a master:
//                            el workflow Release publica en npm con provenance (trusted publishing, sin tokens)
//   bun run release:dry      solo comprueba y simula `npm publish` (no toca git ni npm)
//   bun run release:local    comprueba, versiona y publica desde esta máquina (`npm login`; 2FA interactivo)
//
// En modo pre (`.changeset/pre.json`) las versiones salen como X.Y.Z-beta.N con dist-tag `beta`.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const args = new Set(process.argv.slice(2));
const dry = args.has("--dry-run");
const local = args.has("--local");
const PKGS = ["packages/scanner", "packages/ai"];

const run = (cmd, argv, opts = {}) => {
  console.log(`\n$ ${cmd} ${argv.join(" ")}`);
  execFileSync(cmd, argv, { cwd: ROOT, stdio: "inherit", ...opts });
};
const out = (cmd, argv) => execFileSync(cmd, argv, { cwd: ROOT, encoding: "utf8" }).trim();
const fail = (msg) => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};
const version = (p) => JSON.parse(readFileSync(join(ROOT, p, "package.json"), "utf8"));

// 1. Estado de git: rama master, sin cambios y al día con origin.
if (!dry) {
  if (out("git", ["branch", "--show-current"]) !== "master") fail("publica desde master");
  if (out("git", ["status", "--porcelain"])) fail("hay cambios sin commitear");
  run("git", ["fetch", "origin", "master"]);
  if (out("git", ["rev-parse", "HEAD"]) !== out("git", ["rev-parse", "origin/master"]))
    fail("master no coincide con origin/master (haz pull/push antes)");
}

// 2. Hay algo que publicar.
const pending = readFileSync(join(ROOT, ".changeset/pre.json"), "utf8");
const done = new Set(JSON.parse(pending).changesets);
const fresh = out("ls", [".changeset"])
  .split("\n")
  .filter((f) => f.endsWith(".md") && f !== "README.md" && !done.has(f.slice(0, -3)));
if (!fresh.length) fail("no hay changesets nuevos (crea uno con `bun run changeset`)");
console.log(`changesets nuevos: ${fresh.join(", ")}`);

// 3. Motor WASM (Docker si no hay emsdk local) y comprobaciones de CI.
if (!existsSync(join(ROOT, "packages/engine-wasm/out/browser"))) {
  const hasEmcc = (() => {
    try {
      out("emcc", ["--version"]);
      return true;
    } catch {
      return false;
    }
  })();
  if (hasEmcc) run("bash", ["packages/engine-wasm/build.sh", "all"]);
  else {
    const uid = `${process.getuid()}:${process.getgid()}`;
    run("docker", [
      "run",
      "--rm",
      "-u",
      uid,
      "-e",
      "HOME=/tmp",
      "-v",
      `${ROOT}:${ROOT}`,
      "-w",
      ROOT,
      "emscripten/emsdk:6.0.2",
      "bash",
      "packages/engine-wasm/build.sh",
      "all",
    ]);
  }
}
run("bun", ["run", "lint"]);
run("bun", ["run", "build"]);
run("bun", ["run", "typecheck"]);
run("bun", ["run", "test"]);
for (const p of PKGS) {
  if (version(p).private) continue;
  run("bunx", ["publint"], { cwd: join(ROOT, p) });
  run("bunx", ["@arethetypeswrong/cli", "--pack", "--profile", "esm-only"], { cwd: join(ROOT, p) });
}

if (dry) {
  run("bunx", ["changeset", "status", "--verbose"]);
  for (const p of PKGS)
    if (!version(p).private) run("npm", ["pack", "--dry-run"], { cwd: join(ROOT, p) });
  console.log("\n✓ dry-run correcto (no se tocó git ni npm)");
  process.exit(0);
}

// 4. Versión + CHANGELOG, commit y push (o publicación local).
run("bunx", ["changeset", "version"]);
run("bun", ["install"]);
const published = PKGS.map(version).filter((p) => !p.private);
const tag = published.map((p) => `${p.name}@${p.version}`).join(", ");
run("git", ["add", "-A"]);
run("git", ["commit", "-m", `chore(release): ${tag}`]);

if (local) {
  run("bun", ["run", "build"]);
  run("bunx", ["changeset", "publish"]);
  run("git", ["push", "--follow-tags", "origin", "master"]);
  console.log(`\n✓ publicado desde local: ${tag}`);
} else {
  run("git", ["push", "origin", "master"]);
  const repo = out("git", ["remote", "get-url", "origin"])
    .replace(/\.git$/, "")
    .replace(/^git@github\.com:/, "https://github.com/");
  console.log(
    `\n✓ ${tag} enviado; el workflow Release lo publica: ${repo}/actions/workflows/release.yml`,
  );
}
