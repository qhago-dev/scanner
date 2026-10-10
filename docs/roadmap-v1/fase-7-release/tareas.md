# Fase 7 — Tareas

## F7.1 — Verificación de nombre y repo público
**Esfuerzo**: 1h
- [ ] `rg '@scanai/'` sin resultados si el nombre elegido en F0.7 es otro
- [ ] Repo público en GitHub con descripción, topics y enlace a docs

## F7.2 — `package.json` y build final
**Esfuerzo**: 4h · **Archivos**: `packages/scanner/package.json`, `tsup.config.ts`
- [ ] `exports`, `files`, `sideEffects`, `engines`, metadatos del diseño
- [ ] Builds `browser` y `node`
- [ ] `LICENSE` + `NOTICE` en la raíz con todo lo de ADR-09 (ZXing-C++, stb_image, runtime de Emscripten, libc++/libc++abi, musl) y copia al paquete en el build
- [ ] `publint` y `attw --pack --profile esm-only` en CI

## F7.3 — Apps de ejemplo
**Esfuerzo**: 1,5 d · **Archivos**: `apps/examples/*`
- [ ] Las 11 apps de la tabla, cada una con un test e2e mínimo
- [ ] Job `examples` en CI usando el tarball (`npm pack`), no el workspace

## F7.4 — Pipeline de release
**Esfuerzo**: 4h · **Archivos**: `.github/workflows/release.yml`, `smoke.yml`, `.changeset/`
- [ ] Extender `release.yml` de F0.8: `changeset pre exit`, publicación en `latest`
- [ ] GitHub Release con notas y checksums sha256 de los `.wasm`
- [ ] Smoke test con npm, pnpm, yarn y bun tras cada publicación

## F7.5 — Sitio de docs
**Esfuerzo**: 1,5 d · **Archivos**: `docs-site/`
- [ ] Estructura del diseño; quick start probado por alguien que no conoce el proyecto
- [ ] Todas las guías del requerimiento, incluidas "Escanear archivos", Vite y CDN
- [ ] TypeDoc integrado
- [ ] Página de benchmark generada desde `bench/results`
- [ ] FAQ con anclas para cada `ScanError.code`
- [ ] Deploy automático

## F7.6 — README y gobernanza
**Esfuerzo**: 3h
- [ ] README del diseño (raíz y paquete)
- [ ] `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, plantillas de issue/PR
- [ ] `docs/soporte.md`: navegadores, Node/Bun, política semver y de deprecaciones

## F7.7 — Release 1.0
**Esfuerzo**: 2h
- [ ] Gate G7a sobre el último RC: DoD completa con evidencia enlazada
- [ ] `changeset pre exit` → `1.0.0` en `latest`
- [ ] Gate G7b: smoke tests post-publicación
- [ ] Anuncio (README, GitHub Release, comparación con Quagga2 enlazando a metodología)
- [ ] Actualizar estado de todas las fases a `Hecha`
