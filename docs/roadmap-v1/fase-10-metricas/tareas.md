# Fase 10 — Tareas

Orden: A completo → F10.L (línea base) → B8 → B10 (si procede) → B7 → cierre. Commits locales `F10.<n>`; sin push.

## A · Benchmark y datos

- [x] **F10.1** Tres splits + guarda y registro · 0,5 d
  `public/import.py`, `dataset/manifest.ts`, `manifest.schema.json`, `bench/guard.ts` (+ test), `cli.ts`,
  `runners/video.ts`, `device-eval.ts`, `runners/device-cam.ts`, `bench/README.md`, `SOURCES.md`, `results/baseline.md`
- [x] **F10.2** Fila "publicable" y `--exclude-license` · 2 h · `report.ts`, `cli.ts`
- [x] **F10.3** Negativas y desenfoque derivados · 1 d · `public/derive.py`, `dataset/manifest.ts` (`public-neg`,
  `public-blur`), `.gitignore`, `bench.yml` (zxing-cpp==3.1.1), `SOURCES.md`
  - [ ] Contar rendimiento de negativas; revisión visual de 30
  - [ ] Comprobar `L` (solo barras) en 10 ejemplos
  - [ ] `public-blur` (gaussiano, disco, movimiento) con tipo y σ nominal; conteos por formato
- [x] **F10.4** `device` v2 · 1 d · `device/build.py`, `device/splits.json` (privado), `coverage.ts`,
  `dataset/targets.json`, `device-eval.ts`, `runners/device-cam.ts`, `docs/guias/captura-device.md`,
  `docs/release/acciones-externas.md`
- [x] **F10.5** Estadística: `se`/MDE, objetos con código, conteo por objeto + test de signos, Clopper-Pearson, detalle por
  muestra en el JSON, `diff.ts` · 0,5 d · `metrics.ts`, `metrics.test.ts`, `report.ts`, `cli.ts`, `diff.ts`
- [x] **F10.6** Latencia en vídeo + presupuestos · 0,5 d · `runners/video.ts`, `budget.ts` (+ test), `budgets.json`
  (provisional; valores en F10.L), `bench/README.md`
- [x] **F10.L** Línea base sobre `dev`, 3 ejecuciones (`public`, `public-neg`, `public-blur`, `device`, zxing,
  `synthetic-video` ×1 y ×5; `qhago` y `qhago+ai`) → `results/2026-10-12-f10-baseline.md`, `budgets.json`;
  decisión documentada sobre B10 y objetivo de B7

## B · Mejoras del motor (criterios: `requerimiento.md`)

- [x] **F10.8** Cajas IA → deblur · 1 d — **integrado detrás de `advanced.deblurProposals` (default false)**: +43 / −0 objetos en `public-blur/dev` (p < 0,001) pero 1 falsa nueva (alucinación consistente en 5 líneas) → no cumple el criterio 2; la parte de sesión no es aprobable con `device-cam` (sin IA) y no se integra. Defensa añadida para todos: ≥ 1,5 px/módulo · `plugins.ts`, `core.ts`, `deblur/locate.ts`, `scanner/session.ts`
  - [ ] `quadToRegions` con tests (caja rotada, casi cuadrada)
  - [ ] decode() y sesión (unión, ≤ 2 regiones IA); medida y `diff.ts`; changeset
- [ ] ~~**F10.10** deblur EAN-8 en `decode()`~~ — **no se implementa**: brecha +4,5 / +6,9 pp < 10 pp (F10.L) · 2,5 d · `deblur/ean.ts`, `span.ts`, `index.ts`, `core.ts`
  - [ ] Refactor `Symbology` con EAN-13 idéntico (fixtures + snapshot)
  - [ ] EAN-8: tests σ 0,3-1,2, invertido, ruido, negativos; 0 EAN-8 en fotos EAN-13; changeset
- [ ] **F10.7** Latencia de cola · 1 d · `bench/profile-decode.ts`, `core.ts`, `types.ts` (JSDoc)
  - [ ] Perfilado; candidatas una a una; tests con reloj inyectado; changeset

## Cierre

- [ ] **F10.C** `public/test` con `--reason "Cierre F10"` (+ `public-neg`/`public-blur` test); `device/test` solo si hay
  captura nueva; informe `results/<fecha>-f10-cierre.md`; fila de la fase en el README del roadmap; `baseline.md`.

## Acciones del autor

- Repartir productos en `splits.json` y capturar `device` v2 (`docs/guias/captura-device.md`) hasta que
  `coverage.ts --strict` pase.
- Clips reales cortos para retomar M7.
- Probar en el Android la versión final en modo depuración (ttfr y % frames > 150 ms reales).
