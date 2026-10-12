import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Options } from "tsup";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

// Sin import() dinámicos (ADR-06: Vite construye workers en iife, también los del usuario que importan esta
// librería: lo verifica apps/tarball/vite-user-worker). Los chunks compartidos son imports estáticos
// en el mismo directorio, así que import.meta.url (worker.js, .wasm) sigue resolviendo bien.
const common: Options = {
  format: ["esm"],
  target: "es2022",
  sourcemap: true,
  treeshake: true,
  dts: false,
  minify: true,
  noExternal: [/qhago_engine/],
  define: { __QHAGO_VERSION__: JSON.stringify(pkg.version) },
};

/** En el build de Node, los submódulos que importan "../index" usan la entrada de Node. */
const nodeIndex = {
  name: "node-index",
  setup(build: {
    onResolve: (
      o: { filter: RegExp },
      cb: (a: { importer: string }) => { path: string } | undefined,
    ) => void;
  }) {
    build.onResolve({ filter: /^\.\.\/index$/ }, (a) =>
      a.importer.includes("/src/polyfill/")
        ? { path: fileURLToPath(new URL("./src/index.node.ts", import.meta.url)) }
        : undefined,
    );
  },
};

export default defineConfig([
  {
    ...common,
    entry: {
      index: "src/index.ts",
      polyfill: "src/polyfill/index.ts",
      "quagga-compat": "src/quagga-compat/index.ts",
      ui: "src/ui/index.ts",
      parsers: "src/parsers/index.ts",
    },
    outDir: "dist/browser",
    platform: "browser",
    splitting: true,
    clean: false,
  },
  {
    // Workers: un único archivo autocontenido cada uno.
    ...common,
    entry: { worker: "src/worker/worker.ts", "worker-host": "src/worker-host.ts" },
    outDir: "dist/browser",
    platform: "browser",
    splitting: false,
    clean: false,
    onSuccess: "node scripts/copy-wasm.mjs --dist",
  },
  {
    ...common,
    entry: {
      index: "src/index.node.ts",
      polyfill: "src/polyfill/index.ts",
      parsers: "src/parsers/index.ts",
    },
    outDir: "dist/node",
    platform: "node",
    splitting: true,
    clean: false,
    esbuildPlugins: [nodeIndex as never],
  },
]);
