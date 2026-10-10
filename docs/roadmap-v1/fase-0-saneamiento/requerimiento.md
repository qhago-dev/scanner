# Fase 0 — Saneamiento y base

**Esfuerzo**: 4-5 días · **Prioridad**: Bloqueante · **Depende de**: —

## Problema

El repo mezcla código que no funciona (pipeline Rust, wrappers), artefactos binarios versionados sin control (`.wasm`, `.onnx` de prueba, capturas), documentación con métricas inventadas y ninguna verificación automática. No es posible saber si un cambio rompe algo.

## Requerimiento

Dejar una base honesta, compilable y verificable sobre la que construir las fases siguientes.

### Debe

1. Inicializar git con historial limpio y `.gitignore` correcto (sin `node_modules`, builds, capturas, modelos de prueba). El estado actual se conserva como **tarball fuera de git** (`scanai-snapshot-2026-10-10.tar.zst`), no como primer commit, para no meter binarios en el historial.
2. Reestructurar a monorepo según ADR-10.
3. Archivar (no borrar) lo que no se usará en el camino a 1.0: `core/src/*.rs`, `wrappers/*`, `sdk/src/onnx-bridge.ts`, modelos de entrenamiento descartados por ADR-03/ADR-04 (SR, deblur, perspectiva, autofocus). El checkpoint `autofocus_best.pth` va solo al tarball.
4. Reescribir el README: qué es, estado real (alpha, en desarrollo), objetivos **marcados como objetivos**, sin tablas de resultados no medidos.
5. Marcar `PHASE_PLAN.md` y `docs/sprints/` como obsoletos apuntando a `docs/roadmap-v1/`.
6. CI mínimo (GitHub Actions): instalar, typecheck, lint, test (aunque haya pocos), build del WASM con caché de emsdk.
7. Decidir ADR-01 (compilar ZXing propio vs depender de `zxing-wasm`) con una prueba de 1 día, incluida la auditoría manual de licencias de lo que se enlaza en el WASM (ADR-09).
8. Cerrar ADR-11 (nombre del paquete) y reservar el nombre en npm.
   **El repo pasa a público en GitHub en esta fase**: npm solo genera provenance desde repos públicos, y la primera publicación con provenance es en F2. El dataset de benchmark nunca entra al repo (bucket privado, ADR-12).
9. Pipeline de pre-release listo para F2.9: changesets en modo pre, workflow de publicación con provenance y estrategia para la primera publicación (ver diseño).

### No debe

- Reescribir el motor (eso es F2).
- Borrar código o datos sin moverlo a `archive/`.

## Criterios de aceptación

- [ ] `git status` limpio tras `bun install && bun run build`.
- [ ] `bun run typecheck`, `bun run lint`, `bun run test` pasan en local y en CI.
- [ ] El README no contiene números de rendimiento sin fuente.
- [ ] `docs/sprints/README.md` y `PHASE_PLAN.md` tienen aviso de obsolescencia.
- [ ] ADR-01 en estado `Aceptada` con la evidencia de la prueba anexada.
- [ ] Tamaño del repo sin `node_modules` < 30 MB (sin `.onnx` de 13 MB ni `zxing-cpp` vendorizado: se usa submódulo o descarga en build) y `git count-objects -vH` del historial < 30 MB.
- [ ] ADR-11 en estado `Aceptada`; nombre reservado (placeholder `0.0.0` publicado y deprecado con mensaje "usa @alpha", o scope de organización creado).
- [ ] Repo público en GitHub; `git log` revisado para que no contenga secretos ni datos del dataset.
- [ ] `bunx changeset status` funciona; el workflow `release.yml` hace un dry-run verde según la política de dist-tags del README.
