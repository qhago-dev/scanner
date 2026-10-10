# Fase 0 — Tareas

## F0.1 — Git y limpieza
**Esfuerzo**: 2h · **Archivos**: raíz, `.gitignore`
- [x] Snapshot del estado actual en tarball fuera de git (`scanai-snapshot-2026-10-10.tar.zst`) guardado en almacenamiento externo
- [x] Borrar del árbol de trabajo binarios de prueba (`identity.onnx`, `mobilenetv2-7.onnx`, `ort-wasm*.wasm` copiados a mano, `demo/captures/`, `*.pyc`, `checkpoints/`) — ya están en el tarball
- [x] Ajustar `.gitignore`: `apps/demo/captures/`, `*.onnx` salvo `packages/ai/models/`, artefactos de `packages/engine-wasm/out/`
- [x] `git init`, rama `main`, primer commit **después** de la limpieza y de F0.2

## F0.2 — Monorepo
**Esfuerzo**: 4h · **Archivos**: ver tabla en `disenio.md`
- [x] Crear `packages/`, `apps/`, `bench/`, `archive/`
- [x] Mover archivos según la tabla (`mv`; aún no hay repo git, el primer commit es en F0.1 tras la limpieza)
- [x] `package.json` raíz con workspaces y scripts
- [x] `tsconfig.base.json` con `strict`, `moduleResolution: "bundler"`, `target: "ES2022"`
- [x] Biome configurado

## F0.3 — ZXing como submódulo y build reproducible
**Esfuerzo**: 4h · **Archivos**: `packages/engine-wasm/`
- [x] `git submodule add https://github.com/zxing-cpp/zxing-cpp vendor/zxing-cpp` fijado a tag
- [x] `build.sh` sin rutas absolutas; versión de emsdk fijada
- [x] Verificar que produce el mismo `.wasm` funcional que hoy (test con `test-barcode.png`)

## F0.4 — Prueba ADR-01
**Esfuerzo**: 1 d · **Archivos**: `docs/roadmap-v1/00-decisiones.md`
- [x] Script de comparación build propio vs `zxing-wasm` (tamaño, tiempo, opciones)
- [x] Rellenar la tabla del diseño y marcar ADR-01 como `Aceptada` o modificarla

## F0.5 — README honesto y avisos
**Esfuerzo**: 2h · **Archivos**: `README.md`, `PHASE_PLAN.md`, `docs/sprints/README.md`, `ARCHITECTURE.md`
- [x] README: descripción, estado `alpha / en desarrollo`, objetivos (sin cifras), enlace al roadmap
- [x] Badges solo de cosas verificables (licencia, CI)
- [x] Aviso de obsolescencia en `PHASE_PLAN.md`, `docs/sprints/README.md`, `ARCHITECTURE.md`

## F0.6 — CI
**Esfuerzo**: 4h · **Archivos**: `.github/workflows/ci.yml`
- [x] Job `check` (typecheck, lint, test)
- [x] Job `wasm` con caché de emsdk y artefacto
- [x] Job `license`
- [ ] Badge de CI en README

## F0.7 — Nombre del paquete (ADR-11)
**Esfuerzo**: 2h · **Archivos**: `docs/roadmap-v1/00-decisiones.md`
- [x] Decisión del autor entre candidatos; verificar npm, GitHub y marca
- [ ] Crear la organización/scope en npm
- [ ] Hacer público el repo en GitHub (requisito de provenance) tras revisar historial
- [x] Reemplazar el marcador `@qhago/*` en `docs/roadmap-v1/` y `package.json`

## F0.8 — Pipeline de pre-release
**Esfuerzo**: 4h · **Archivos**: `.changeset/`, `.github/workflows/release.yml`
- [x] `bunx changeset init`; `changeset pre enter alpha`
- [ ] Publicar placeholders `0.0.0` de `@qhago/scanner` y `@qhago/ai` con token granular temporal (scope) desde CI y deprecarlos
- [ ] Configurar trusted publisher de ambos paquetes en npmjs.com y revocar el token
- [ ] `release.yml` con `id-token: write`, npm ≥ 11.5.1, Node ≥ 22.14; sin pasos que requieran token; dry-run verde

## Checklist de salida
- [x] Criterios de aceptación de `requerimiento.md` cumplidos
- [x] Estado de la fase actualizado en `docs/roadmap-v1/README.md`

## Estado (2026-10-10)

Hecha en local. Pendiente de acciones externas del autor (ver `docs/release/acciones-externas.md`): organización npm, repo público, bootstrap de placeholders, trusted publishing y primera ejecución de CI en GitHub (los workflows están escritos pero no se han ejecutado).
Notas: el repo ya tenía historial git (4 commits en `master`, sin binarios grandes): se conservó y se trabaja sobre `master`. zxing-cpp fijado a v3.1.1 (la copia vendorizada era v2.3.0).
