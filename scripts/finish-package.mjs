// Último paso del build de un paquete publicable (F7.2):
// 1. Copia LICENSE, NOTICE y LICENSE-APACHE-2.0 de la raíz del monorepo al paquete (van en el tarball).
// 2. Reescribe los imports relativos de dist/types/**/*.d.ts con extensión explícita ("./x" → "./x.js" o
//    "./x/index.js"): tsc los emite sin extensión y con moduleResolution node16/nodenext no se resolvían
//    (los tipos quedaban en `any`; lo detectó attw --profile esm-only).
// Uso: node ../../scripts/finish-package.mjs   (desde el directorio del paquete)
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = process.cwd();
for (const f of ["LICENSE", "NOTICE", "LICENSE-APACHE-2.0"])
  copyFileSync(join(root, f), join(pkg, f));

const types = join(pkg, "dist", "types");
let fixed = 0;
function walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".d.ts")) fix(p);
  }
}
function fix(file) {
  const src = readFileSync(file, "utf8");
  const out = src.replace(
    /((?:from|import)\s*\(?\s*["'])(\.{1,2}\/[^"']*?)(["'])/g,
    (m, a, spec, b) => {
      if (/\.(m?js|json)$/.test(spec)) return m;
      const base = join(dirname(file), spec);
      const ext = existsSync(`${base}.d.ts`)
        ? ".js"
        : existsSync(join(base, "index.d.ts"))
          ? "/index.js"
          : null;
      if (ext === null) return m;
      fixed++;
      return `${a}${spec}${ext}${b}`;
    },
  );
  if (out !== src) writeFileSync(file, out);
}
if (existsSync(types)) walk(types);
console.log(`finish-package: licencias copiadas, ${fixed} imports de .d.ts con extensión`);
