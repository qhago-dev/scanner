# Fase 2 — Tareas

## F2.0 — `ScanError`
**Esfuerzo**: 2h · **Archivos**: `packages/scanner/src/errors.ts`
- [ ] Clase `ScanError` con `code` (unión completa de 8 códigos), `docsUrl`, `cause`
- [ ] Usada por todo el código de F2-F3 (prohibido `throw new Error` en API pública)

## F2.1 — Build solo-lectores
**Esfuerzo**: 4h · **Archivos**: `packages/engine-wasm/build.sh`, `CMakeLists.txt`
- [ ] CMake de ZXing con `ZXING_WRITERS=OFF`, ejemplos y tests apagados
- [ ] Flags de Emscripten del diseño; `wasm-opt -Oz`
- [ ] Reporte de tamaño (raw y gzip) en cada build
- [ ] Medir `-fwasm-exceptions` vs excepciones JS (tamaño y compatibilidad)
- [ ] Dos artefactos: navegador (`ENVIRONMENT=web,worker`) y node (`ENVIRONMENT=node`, + stb_image); verificar que ningún glue tiene top-level await

## F2.2 — Bridge C++ con `ReadBarcodes`
**Esfuerzo**: 1 d · **Archivos**: `packages/engine-wasm/src/bridge.cpp`
- [ ] Inventario de campos de `ZXing::Barcode` en el tag fijado → ajustar `BarcodeResult` (no inventar campos)
- [ ] `sa_abi_version`, `sa_options`, `sa_read`, `sa_result_json`
- [ ] Los campos de `BarcodeResult` confirmados en el inventario (formato, texto, bytes y esquinas son obligatorios)
- [ ] Buffer de entrada reutilizable (`sa_alloc_input`)
- [ ] Opción `return_errors` → candidatos con posición y tipo de error en el JSON de resultado
- [ ] Región (`region_*`) aplicada antes de leer
- [ ] Tests nativos (compilar el bridge para host con CMake) sobre `test/samples`
- [ ] Compilar y correr los **blackbox tests nativos** de ZXing en el mismo tag; guardar la línea base `(muestra, rotación, modo) → leído`

## F2.3 — Preproceso clásico
**Esfuerzo**: 1,5 d · **Archivos**: `packages/engine-wasm/src/preprocess.cpp`
- [ ] RGBA → luma BT.601 (y entrada luma directa)
- [ ] CLAHE (tiles 8×8, clip configurable)
- [ ] Unsharp mask
- [ ] Resize bicúbico 0,5×/2×
- [ ] Tests con imágenes golden (hash del resultado)

## F2.4 — Cascada con presupuesto de tiempo
**Esfuerzo**: 1 d · **Archivos**: `packages/engine-wasm/src/cascade.cpp`
- [ ] Estrategias `fast`/`balanced`/`thorough`
- [ ] Corte por `time_budget_ms` (`emscripten_get_now`)
- [ ] Ajustar el orden de pasos con `bench` split `dev` (registrar en `disenio.md`)

## F2.5 — Engine TS
**Esfuerzo**: 1 d · **Archivos**: `packages/scanner/src/engine/`
- [ ] Carga única, `compileStreaming` con fallback, caché del `WebAssembly.Module`
- [ ] Comprobación `sa_abi_version` con error accionable
- [ ] Worker interno compartido para `decode()` en main thread (ADR-02), con `worker: false`
- [ ] Límite `maxInputPixels` (16 MP) y reducción a 2 560 px en `fast`/`balanced`
- [ ] Resolución por `import.meta.url` + override `wasmUrl`/`wasmModule`
- [ ] Escritura de `sa_options` en el heap; lectura de resultados; nunca cachear vistas `HEAPU8` (memory growth)
- [ ] `configure()` + `init()` según el diseño
- [ ] Variante SIMD: medir; solo si mejora ≥ 15 % se publica y se añade detección + carga (si no, se descarta y se registra)
- [ ] Error `ENGINE_LOAD_FAILED` con pistas: ABI distinta (versión esperada vs encontrada) y ruta `/.vite/deps/` (sugiere `optimizeDeps.exclude`)
- [ ] Opción `engine` (`wasm` | `native` | `auto`, ADR-07)

## F2.6 — Adaptadores de entrada
**Esfuerzo**: 1 d · **Archivos**: `packages/scanner/src/input/`
- [ ] Navegador: ImageData, ImageBitmap, VideoFrame (plano Y con `visibleRect`/`layout`; fallback canvas para RGBA/BGRA), img, canvas, OffscreenCanvas, Blob con EXIF
- [ ] Node/Bun: Buffer PNG/JPEG (wasm node), objeto `{data,width,height,format}`; WebP → `INVALID_INPUT` con mensaje que sugiere convertir
- [ ] Entrada condicional por `exports` (`"browser"` / `"node"` / `"bun"`) para no arrastrar código de Node al navegador

## F2.7 — Validación y `confidence`
**Esfuerzo**: 4h · **Archivos**: `packages/scanner/src/validate.ts`
- [ ] Reglas del diseño
- [ ] Tests unitarios por formato con casos válidos e inválidos

## F2.8 — API `decode()` + tests
**Esfuerzo**: 1 d · **Archivos**: `packages/scanner/src/decode.ts`, `test/`
- [ ] `decode` (con sobrecarga `includeErrors`), `region`, `signal`, `init`, `configure`, tipos exportados
- [ ] Snapshot idéntico entre runtimes para PNG/raw; ≥ 98 % para JPEG
- [ ] Tests de regresión con samples de ZXing en Node, Bun y Playwright (3 motores)
- [ ] Activar `bench/engines/scanai.ts` y correr G2

## F2.9 — Release alpha
**Esfuerzo**: 2h
- [ ] Changeset + primera publicación `0.x.y-alpha.N` (dist-tag `alpha`) con el pipeline de F0.8
- [ ] Nota en README: "API inestable"

## Checklist de salida
- [ ] Gate G2 cumplido y reporte en `bench/results/`
- [ ] Estado actualizado en `docs/roadmap-v1/README.md`
