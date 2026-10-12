# Fase 7 — Tareas

## F7.1 — Verificación de nombre y repo público
**Esfuerzo**: 1h
- [x] `rg '@scanai/'` sin resultados si el nombre elegido en F0.7 es otro (2026-10-12)
- [ ] Repo público en GitHub con descripción, topics y enlace a docs (acción del autor)

## F7.2 — `package.json` y build final
**Esfuerzo**: 4h · **Archivos**: `packages/scanner/package.json`, `tsup.config.ts`
- [x] `exports`, `files`, `sideEffects`, `engines`, metadatos del diseño
- [x] Builds `browser` y `node`
- [x] `LICENSE` + `NOTICE` en la raíz con todo lo de ADR-09 (ZXing-C++, stb_image, runtime de Emscripten, libc++/libc++abi, musl) y copia al paquete en el build (`scripts/finish-package.mjs`, más `LICENSE-APACHE-2.0`)
- [x] `publint` y `attw --pack --profile esm-only` en CI (attw detectó `.d.ts` sin extensión: corregido)

## F7.3 — Apps de ejemplo
**Esfuerzo**: 1,5 d · **Archivos**: `apps/examples/*`
- [x] Apps contra el tarball (`apps/tarball/run.mjs`): node-cli, bun-runtime (+ `bun build`), vite-vanilla, vite-react, webpack5, next-app-router, astro, cdn-html (8/8). `vite-dev` y `csp-strict` ya tienen e2e en `packages/scanner/e2e`; `quagga-migration` sigue como ejemplo de workspace
- [x] Job `examples` en CI usando el tarball (`npm pack`), no el workspace

## F7.4 — Pipeline de release
**Esfuerzo**: 4h · **Archivos**: `.github/workflows/release.yml`, `smoke.yml`, `.changeset/`
- [x] Extender `release.yml` de F0.8 (`changeset pre exit` es un commit del autor al pasar a 1.0; el workflow publica en el dist-tag que toque)
- [x] GitHub Release con notas y checksums sha256 de los `.wasm`
- [x] Smoke test con npm, pnpm, yarn y bun tras cada publicación (`smoke.yml`, también CDN)

## F7.5 — Sitio de docs
**Esfuerzo**: 1,5 d · **Archivos**: `docs-site/`
- [x] Estructura del diseño (`docs-site/`); quick start — pendiente: probarlo con alguien que no conoce el proyecto
- [x] Todas las guías del requerimiento, incluidas "Escanear archivos", Vite y CDN
- [x] TypeDoc integrado
- [x] Página de benchmark generada desde `bench/results`
- [x] FAQ con anclas para cada `ScanError.code` (verificadas en el build)
- [x] Deploy automático (`docs.yml`, GitHub Pages; dominio: acción del autor)

## F7.6 — README y gobernanza
**Esfuerzo**: 3h
- [x] README del diseño (raíz y paquete), con cifras de `bench/` (fecha y commit)
- [x] `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, plantillas de issue/PR
- [x] `docs/soporte.md`: navegadores, Node/Bun, política semver y de deprecaciones

## F7.7 — Release 1.0
**Esfuerzo**: 2h
- [ ] Gate G7a sobre el último RC: DoD completa con evidencia enlazada
- [ ] `changeset pre exit` → `1.0.0` en `latest`
- [ ] Gate G7b: smoke tests post-publicación
- [ ] Anuncio (README, GitHub Release, comparación con Quagga2 enlazando a metodología)
- [ ] Actualizar estado de todas las fases a `Hecha`
