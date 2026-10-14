# Fase 7 — Documentación, empaquetado y release 1.0

**Esfuerzo**: 4-5 días · **Prioridad**: Bloqueante para 1.0 · **Depende de**: F4, F6 (F5 opcional) · **Versión**: `1.0.0`

## Problema

Para que la librería sea usable por terceros tiene que instalarse sin fricción con cualquier gestor (npm, pnpm, yarn, bun), funcionar con cualquier bundler sin configuración y tener documentación que resuelva los problemas típicos (HTTPS, permisos, iOS, assets WASM).

## Requerimiento

### Debe

1. **Paquete npm correcto** (ADR-06):
   - `package.json` con `type: module`, `exports` (con condiciones `types`, `browser`, `node`, `bun`, `default`), `sideEffects: false` (salvo `ui` que registra el custom element), `files`, `engines`, `repository`, `homepage`, `bugs`, `keywords`, `funding` opcional.
   - Incluye: `dist/`, `wasm/`, `LICENSE`, `NOTICE`, `README.md`, `CHANGELOG.md`.
   - Pasa `publint` y `@arethetypeswrong/cli --profile esm-only` sin errores.
   - `LICENSE` y `NOTICE` viven en la raíz del monorepo y se copian a `packages/scanner/` (y `packages/ai/`) en el build, antes de `npm pack`.
2. **Compatibilidad verificada** con apps de ejemplo en CI: Vite (React y vanilla; build y dev), webpack 5, Next.js App Router (client component; import en server component no rompe), Astro, Bun (`bun build` + runtime), Node (decode de archivos), `<script type="module">` desde jsDelivr/unpkg con rutas directas a `dist/` (esm.sh y `/+esm` no soportados, ADR-06).
3. **Bun**: `bun add @qhago/scanner` + `bun test` de ejemplo; decode en runtime Bun. No hace falta publicar aparte: Bun instala desde el registro npm. La publicación oficial es siempre la de CI (punto 4).
4. **Release automatizado**:
   - changesets para versionado y CHANGELOG.
   - El pipeline de F0.8 (trusted publishing OIDC, sin tokens) se extiende con: salida del modo pre, publicación en `latest`, GitHub Release y smoke tests.
   - dist-tags `alpha`, `beta`, `rc` (pre-releases) y `latest` (estable), según la política del README.
   - GitHub Release con notas y artefactos (`.wasm`, checksums).
5. **Documentación** (sitio estático, p. ej. Astro Starlight o VitePress, en GitHub Pages/Vercel):
   - Quick start en 5 minutos (3 snippets: npm/bun + bundler, CDN, Node/Bun).
   - Guías: cámara (permisos, HTTPS, iOS), ROI y rendimiento, multi-código, escanear archivos (región, imágenes grandes, lotes), UI component, polyfill, migración desde Quagga2, parsers GS1/QR/AAMVA, self-hosting de WASM y CDN, Vite (`optimizeDeps.exclude`), CSP, frameworks (React, Vue, Svelte, Angular, Next, Nuxt).
   - API reference generada con TypeDoc.
   - Página de benchmark con los últimos resultados de `bench/` y metodología.
   - FAQ/troubleshooting enlazada desde `ScanError.docsUrl`.
   - Demo en vivo.
6. **Gobernanza**: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` (canal de reporte), plantillas de issues/PR, política de soporte de navegadores y de versiones (`docs/soporte.md`).
7. **Nombre definitivo**: ya decidido en F0.7; aquí solo se verifica que no quedan marcadores `@qhago/*` si el nombre es otro.

### No debe

- Publicar desde una máquina local.
- Publicar con un README que cite números no medidos.

## Criterios de aceptación

### G7a — antes de publicar 1.0 (verificado sobre la última `0.x.y-rc.N`)

> F12: en modo pre todas las versiones salen de `0.1.0` hasta el changeset `major`, así que el RC será `0.1.0-rc.N`
> (o `1.0.0-rc.N` si ya lleva el `major`). Ambos los admite el peer de `@qhago/ai`; `scripts/check-peer.mjs` falla
> si una versión de `@qhago/scanner` quedara fuera.

- [ ] Toda la DoD de `docs/roadmap-v1/README.md` en verde, con evidencia enlazada.
- [ ] `npx publint` y `npx @arethetypeswrong/cli --pack --profile esm-only` sin errores.
- [ ] CI de ejemplos verde (las 11 apps) usando el tarball del RC.
- [ ] `npm i`, `pnpm add`, `yarn add`, `bun add` de `<pkg>@rc` en proyectos limpios funcionan (smoke test).
- [ ] `cdn-html` funciona contra `https://cdn.jsdelivr.net/npm/<pkg>@rc/dist/browser/…`.
- [ ] Provenance visible en la página del RC en npmjs.com.
- [ ] Sitio de docs desplegado (versión preliminar, rama `rc`) con todas las guías listadas.

### G7b — después de publicar 1.0.0
- [ ] `1.0.0` publicado en `latest`.
- [ ] Smoke tests contra `@latest` (los 4 gestores) y `cdn-html` contra `@1`.
- [ ] Badge de provenance visible; docs publicadas como versión estable.
- Si G7b falla: `npm deprecate` de la versión con el motivo y publicación de `1.0.1` con el fix (nunca `unpublish`).
