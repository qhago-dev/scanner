# Fase 6 — Calidad y rendimiento

**Esfuerzo**: 5-7 días (más trabajo continuo desde F2) · **Prioridad**: Bloqueante para 1.0 · **Depende de**: F2-F4 · **Versión**: pre-tag `rc`

## Problema

Una librería de cámara falla de formas que solo aparecen en navegadores, dispositivos y builds concretos. Sin una red de tests automatizada y presupuestos medidos, cada release es una apuesta.

## Requerimiento

### Debe

1. **Tests unitarios** (Vitest, ADR-10): validadores, fusión, tracker, scheduler, parsers, adaptadores. Cobertura ≥ 80 % de líneas en `packages/scanner/src`.
2. **Tests de integración del motor**: regresión con samples de ZXing + 200 imágenes reales del split `dev` con resultados esperados (snapshot), en Node 22/24, Bun y los 3 motores de navegador. Las 200 imágenes reales se descargan en CI con la credencial de F1; en PRs de forks se usan solo los samples de ZXing.
3. **E2E con cámara simulada** (Playwright):
   - Chromium: `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=<clip>.y4m`.
   - Firefox y WebKit: shim de `getUserMedia` que devuelve `canvas.captureStream()` de un canvas donde se dibuja el clip como **secuencia de frames PNG/JPEG** (ningún navegador reproduce y4m en `<video>`, y así no dependemos de los códecs de cada build de Playwright). Ver diseño.
   - Casos: permiso concedido/denegado, lectura de EAN/QR, multi-código, pausa/reanudar, cambio de cámara (2 fakes), rotación (cambio de dimensiones del stream), `destroy()` sin fugas, `<qhago-scanner>`, polyfill, quagga-compat, worker cargado desde otro origen (simulación de CDN con un segundo servidor local con CORS), app Vite en modo **dev** con `optimizeDeps.exclude` y en modo build.
4. **Matriz de compatibilidad** verificada contra "Plataformas soportadas" del README del roadmap (fuente única). Pruebas en dispositivos reales vía BrowserStack/LambdaTest o manual registrado.
5. **Presupuestos** con fallo en CI:
   - Tamaño: `size-limit` por entry point (ver F4) y WASM con el presupuesto fijado al cerrar F2.
   - Rendimiento: benchmark de micro-rendimiento (`decode` 640×480 / 1280×720 con y sin código) con tolerancia de regresión del 10 % respecto a `main` en `desktop-ref`; los valores absolutos de `android-mid`/`ios-ref` se registran en cada RC.
   - Memoria (job **nocturno**, no de PR): 10 min de escaneo en Chromium con `performance.measureUserAgentSpecificMemory` (solo esa página de prueba se sirve con COOP/COEP) + `memory.buffer.byteLength`; el criterio de 30 min de F3 se verifica manualmente en `android-mid` antes de cada RC.
   - Main thread: Long Tasks API solo en Chromium (Firefox/Safari no la exponen); en esos navegadores solo se verifica que el scanner funciona.
   - SSR: importar cada entry point en Node sin DOM.
6. **Robustez**: fuzzing del bridge WASM (dimensiones extremas, buffers truncados, opciones inválidas) con libFuzzer en build nativo + fuzz en JS (fast-check). Cero crashes/OOB.
7. **Seguridad**: sin `eval`/`new Function`; compatible con CSP estricta (`script-src 'self' 'wasm-unsafe-eval'`); `npm audit` sin vulnerabilidades altas; dependencias de runtime mínimas.
8. **Accesibilidad** del componente UI: axe-core sin violaciones serias.

### No debe

- Depender de servicios de terceros para los tests de PR (BrowserStack solo en release/nocturno). Excepción: el bucket propio del dataset, con caché de Actions; si no está disponible (o es un PR de fork), los tests usan solo los samples de ZXing y el job no falla por eso.

## Criterios de aceptación

- [ ] CI de PR < 15 min de reloj (jobs en paralelo, presupuesto en el diseño): wasm (cacheado por hash), typecheck + lint, unit + cobertura, integración multi-runtime, e2e en 3 navegadores (suite rápida, sin el test de memoria), size-limit, fast-check (1 000 casos).
- [ ] CI nocturno: bench `dev` completo, test de memoria de 10 min, fuzzing 1 h, smoke de ejemplos. La matriz de dispositivos reales es manual por RC (sesiones en BrowserStack/LambdaTest), no nocturna automática, porque la inyección de cámara en dispositivos reales de nube no está garantizada.
- [ ] Cobertura ≥ 80 %.
- [ ] `docs/compatibilidad.md` con la matriz verificada y fecha.
- [ ] Ejemplo con CSP estricta funcionando.
