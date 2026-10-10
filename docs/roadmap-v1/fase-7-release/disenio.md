# Fase 7 — Diseño

## `package.json` de `@qhago/scanner` (objetivo)

```jsonc
{
  "name": "@qhago/scanner",                    // ADR-11: provisional
  "version": "1.0.0",
  "description": "Barcode & QR scanner for the web, Node and Bun — ZXing-C++ in WebAssembly, multi-frame fusion, optional AI detector.",
  "license": "MIT",
  "type": "module",
  "sideEffects": ["./dist/browser/ui.js"],    // registra el custom element; el resto es puro
  "engines": { "node": ">=22.12" },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "bun": "./dist/node/index.js",        // antes que "node": se evalúan en orden
      "node": "./dist/node/index.js",       // carga wasm/qhago_engine.wasm (build node) (con stb_image)
      "browser": "./dist/browser/index.js", // carga wasm/qhago_engine.wasm
      "default": "./dist/browser/index.js"
    },
    "./worker-host":   { "types": "./dist/worker-host.d.ts",   "default": "./dist/browser/worker-host.js" },
    "./polyfill":      { "types": "./dist/polyfill.d.ts",      "default": "./dist/browser/polyfill.js" },
    "./quagga-compat": { "types": "./dist/quagga-compat.d.ts", "default": "./dist/browser/quagga-compat.js" },
    "./ui":            { "types": "./dist/ui.d.ts",            "default": "./dist/browser/ui.js" },
    "./parsers":       { "types": "./dist/parsers.d.ts",       "default": "./dist/parsers.js" },
    "./wasm/*": "./wasm/*",
    "./package.json": "./package.json"
  },
  "files": ["dist", "wasm", "LICENSE", "NOTICE", "README.md", "CHANGELOG.md"],
  "repository": { "type": "git", "url": "git+https://github.com/<org>/<repo>.git", "directory": "packages/scanner" },
  "keywords": ["barcode", "qr", "qrcode", "scanner", "zxing", "wasm", "ean", "datamatrix", "pdf417", "barcode-detector", "quagga"],
  "publishConfig": { "access": "public", "provenance": true }
}
```

Assets: el worker y el `.wasm` se referencian con `new URL(..., import.meta.url)` dentro de `dist/browser/`, de modo que Vite (build)/webpack/Rollup/esbuild/Bun los copien y les pongan hash automáticamente. Excepciones documentadas en ADR-06: Vite dev (`optimizeDeps.exclude`) y CDN (rutas directas a `dist/`, worker vía bootstrap desde `Blob`). El JS de `dist/node` no se incluye en bundles de navegador gracias a la condición `browser`.

## Build

```
packages/scanner
  tsup (o tsdown) → dist/browser (platform browser), dist/node (platform node), .d.ts
  copia ../engine-wasm/out/*.wasm → wasm/ y dist/browser/
  copia ../../LICENSE y ../../NOTICE al paquete
  post: publint, attw --pack --profile esm-only, size-limit
```

## Pipeline de release

```
PR con changeset ──► merge a main ──► changesets/action crea "Version Packages" PR
                                          │ merge
                                          ▼
                       release.yml (creado en F0.8): build wasm → build ts → tests → publish
                         permissions: id-token: write  (trusted publishing OIDC, ya configurado en F0.8)
                         npm ≥ 11.5.1 + Node ≥ 22.14 en el runner; provenance automática (repo público)
                         changeset publish → dist-tag = pre-tag (alpha/beta/rc) o latest (tras pre exit)
                         gh release create + checksums sha256 de .wasm
                                          ▼
                       smoke.yml: npm/pnpm/yarn/bun install en proyecto limpio + decode de una imagen
```

Pre-releases: `changeset pre enter alpha|beta|rc` según la tabla de versiones del README (sin alias `next`).

## Apps de ejemplo (en `apps/examples/`, cada una con test e2e mínimo)

| App | Verifica |
|---|---|
| `vite-vanilla` | ESM + assets por `import.meta.url` |
| `vite-react` | hook de ejemplo (sin publicar paquete React aún) |
| `webpack5` | `asset/resource` automático de `new URL` |
| `next-app-router` | `"use client"`, import dinámico, sin romper SSR |
| `astro` | isla cliente |
| `bun-runtime` | `decode()` de un PNG con Bun |
| `node-cli` | `decode()` de un JPEG con Node 22 |
| `cdn-html` | `<script type="module">` desde jsDelivr (ruta directa a `dist/`) con worker cross-origin |
| `vite-dev` | `vite dev` con `optimizeDeps.exclude` (la única config documentada) |
| `csp-strict` | CSP de F6 |
| `quagga-migration` | compat F4 |

## Sitio de documentación

```
docs-site/ (Starlight o VitePress)
├── getting-started/  quick-start, instalación (npm/pnpm/yarn/bun/CDN)
├── guides/           camera, ios, performance-roi, multi-code, ui, polyfill, quagga-migration,
│                     parsers, self-hosting-wasm, csp, frameworks/*
├── reference/        API (TypeDoc → markdown), errores (anclas = ScanError.code)
├── benchmark/        resultados + metodología (generado desde bench/results)
└── faq/
```
Despliegue automático en cada release.

## README del paquete (estructura)

1. Una frase + GIF de la demo.
2. Instalación (npm / bun / CDN).
3. 3 ejemplos: imagen, cámara, componente.
4. Formatos soportados y navegadores.
5. Tabla de benchmark **con fecha, commit y enlace a la metodología**.
6. Enlaces a docs, migración desde Quagga2, licencia y NOTICE.
