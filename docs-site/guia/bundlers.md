# Bundlers, CDN, CSP y self-hosting

El paquete es ESM puro. El worker y el `.wasm` se referencian con `new URL(…, import.meta.url)`, que Vite (build),
webpack 5, Rollup, esbuild, Next.js, Astro y Bun copian y versionan solos. Verificado en CI instalando el tarball
publicable en apps de ejemplo (`apps/tarball/`): Node, Bun (runtime y `bun build`), Vite, Vite + React, webpack 5,
Next.js App Router, Astro y CDN.

## Vite en modo dev

El pre-bundling de Vite mueve el paquete a `.vite/deps` y rompe las rutas relativas. Es la única configuración
necesaria:

```ts
// vite.config.ts
export default { optimizeDeps: { exclude: ["@qhago/scanner"] } };
```

Sin ella, el error ([`ENGINE_LOAD_FAILED`](/errors#engine-load-failed)) lo indica. `vite build` no la necesita.

## Node/Bun empaquetados

`bun build`, esbuild o ncc para Node no copian el `.wasm`: copia
`node_modules/@qhago/scanner/wasm/qhago_engine_node.wasm` junto al bundle o usa `configure({ wasmUrl })`.

## CDN

```js
import { decode } from "https://cdn.jsdelivr.net/npm/@qhago/scanner@1/dist/browser/index.js";
```

Ruta directa a `dist/` (jsDelivr o unpkg); esm.sh y `/+esm` reescriben el paquete y rompen las rutas del worker. El
worker de otro origen se arranca desde un `Blob` que lo importa.

## CSP {#csp}

Mínimo necesario (sin `unsafe-eval`):

```
script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net;
worker-src 'self' blob: https://cdn.jsdelivr.net;
```

Sin `blob:` en `worker-src` (CDN) el error lo explica; alternativas: servir el paquete desde tu origen o
`decode(…, { worker: false })`.

## Self-hosting del WASM

Copia `node_modules/@qhago/scanner/dist/browser/` completo a tus assets (el worker importa chunks del mismo
directorio y el `.wasm` va al lado) y apunta a él:

```ts
import { configure } from "@qhago/scanner";
configure({ wasmUrl: "/assets/qhago/qhago_engine.wasm", workerUrl: "/assets/qhago/worker.js" });
```

Los `.wasm` también se exportan como `@qhago/scanner/wasm/*`. Cada release publica también los `.wasm` y sus `SHA256SUMS` en GitHub.
La versión del `.wasm` debe coincidir con la del paquete: si no, `ENGINE_LOAD_FAILED` lo indica (ABI distinta).
