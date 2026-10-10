# Fase 6 — Tareas

> Los tests unitarios y de integración se escriben **durante** F2-F4 junto a cada tarea. Esta fase completa lo que falte y monta la infraestructura.

## F6.1 — Unit y cobertura
**Esfuerzo**: 1 d
- [ ] Completar tests de fusión, tracker, scheduler, validadores, parsers, adaptadores
- [ ] Reporte de cobertura en CI; umbral 80 %

## F6.2 — Integración multi-runtime
**Esfuerzo**: 1 d · **Archivos**: `packages/scanner/test/`
- [ ] Snapshot de resultados (samples ZXing + 200 reales `dev`)
- [ ] Ejecutar en Node 22/24, Bun y Chromium/Firefox/WebKit (Vitest browser mode)

## F6.3 — E2E con cámara simulada
**Esfuerzo**: 1,5 d · **Archivos**: `e2e/`
- [ ] `fake-camera.ts` (clip como secuencia de frames en canvas, errores, 2 cámaras, cambio de dimensiones)
- [ ] Script que genera `clip.y4m` + `frames/` desde cada vídeo fuente (ffmpeg)
- [ ] Specs: permisos, lecturas, multi-código, pausa, cambio de cámara, rotación, destroy, UI, polyfill, quagga-compat
- [ ] Worker cross-origin (segundo servidor con CORS) y Vite dev/build (sin `optimizeDeps.exclude` → verifica que el error trae la pista)
- [ ] `wasmUrl` de otra versión → `ENGINE_LOAD_FAILED` con mensaje de ABI
- [ ] Validar al inicio de F6.3 que `canvas.captureStream` funciona en el WebKit de Playwright en Linux; si no, WebKit e2e corre en runner macOS
- [ ] SSR: import de cada entry en Node sin DOM
- [ ] Medición de main thread (Chromium) en la suite rápida
- [ ] Test de memoria de 10 min en el workflow nocturno

## F6.4 — Presupuestos en CI
**Esfuerzo**: 4h
- [ ] size-limit por entry + check de WASM
- [ ] Micro-benchmarks con comparación contra `main`

## F6.5 — Fuzzing
**Esfuerzo**: 1 d · **Archivos**: `packages/engine-wasm/fuzz/`, `packages/scanner/test/fuzz.test.ts`
- [ ] libFuzzer + ASan/UBSan en nocturno (1 h)
- [ ] fast-check en PR (1 000 casos)
- [ ] Corregir hallazgos

## F6.6 — Seguridad, CSP y licencias
**Esfuerzo**: 3h
- [ ] Ejemplo CSP estricta en e2e
- [ ] `npm audit` y `license-checker` en CI
- [ ] Revisar que no haya `eval` en el glue de Emscripten (`-sDYNAMIC_EXECUTION=0`)

## F6.7 — Matriz de dispositivos reales
**Esfuerzo**: 1 d · **Archivos**: `docs/compatibilidad.md`
- [ ] Ronda manual por RC en BrowserStack/LambdaTest (incluye iOS 16.x) + dispositivos propios del inventario F1.8
- [ ] Todas las filas de "Plataformas soportadas" (iOS Safari ≥ 16.4, Chrome Android 3 gamas, Samsung Internet…)
- [ ] Registro manual por RC en `android-mid`: 30 min de memoria y main thread < 4 ms
- [ ] Publicar matriz con fecha

## F6.8 — Accesibilidad UI
**Esfuerzo**: 2h
- [ ] axe-core en e2e del componente
- [ ] Revisión manual con lector de pantalla (VoiceOver/TalkBack)

## F6.9 — Release candidate
**Esfuerzo**: 1h
- [ ] `changeset pre exit` → `pre enter rc`; publicar `0.x.y-rc.N` (dist-tag `rc`); congelar features; solo fixes hasta 1.0
