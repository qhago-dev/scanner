# Fase 2 — Tareas

## F2.0 — `ScanError`
**Esfuerzo**: 2h · **Archivos**: `packages/scanner/src/errors.ts`
- [x] Clase `ScanError` con `code` (unión completa de 8 códigos), `docsUrl`, `cause`
- [x] Usada por todo el código de F2-F3 (prohibido `throw new Error` en API pública)

## F2.1 — Build solo-lectores
**Esfuerzo**: 4h · **Archivos**: `packages/engine-wasm/build.sh`, `CMakeLists.txt`
- [x] CMake de ZXing con `ZXING_WRITERS=OFF`, ejemplos y tests apagados
- [x] Flags de Emscripten del diseño; `wasm-opt -Oz`
- [x] Reporte de tamaño (raw y gzip) en cada build
- [x] Medir `-fwasm-exceptions` vs excepciones JS (tamaño y compatibilidad)
- [x] Dos artefactos: navegador (`ENVIRONMENT=web,worker`) y node (`ENVIRONMENT=node`, + stb_image); verificar que ningún glue tiene top-level await

## F2.2 — Bridge C++ con `ReadBarcodes`
**Esfuerzo**: 1 d · **Archivos**: `packages/engine-wasm/src/bridge.cpp`
- [x] Inventario de campos de `ZXing::Barcode` en el tag fijado → ajustar `BarcodeResult` (no inventar campos)
- [x] `sa_abi_version`, `sa_options`, `sa_read`, `sa_result_json`
- [x] Los campos de `BarcodeResult` confirmados en el inventario (formato, texto, bytes y esquinas son obligatorios)
- [x] Buffer de entrada reutilizable (`sa_alloc_input`)
- [x] Opción `return_errors` → candidatos con posición y tipo de error en el JSON de resultado
- [x] Región (`region_*`) aplicada antes de leer
- [x] Tests nativos (compilar el bridge para host con CMake) sobre `test/samples`
- [x] Compilar y correr los **blackbox tests nativos** de ZXing en el mismo tag; guardar la línea base `(muestra, rotación, modo) → leído`

## F2.3 — Preproceso clásico
**Esfuerzo**: 1,5 d · **Archivos**: `packages/engine-wasm/src/preprocess.cpp`
- [x] RGBA → luma BT.601 (y entrada luma directa)
- [x] CLAHE (tiles 8×8, clip configurable)
- [x] Unsharp mask
- [x] Resize bicúbico 0,5×/2×
- [x] Tests con imágenes golden (hash del resultado)

## F2.4 — Cascada con presupuesto de tiempo
**Esfuerzo**: 1 d · **Archivos**: `packages/engine-wasm/src/cascade.cpp`
- [x] Estrategias `fast`/`balanced`/`thorough`
- [x] Corte por `time_budget_ms` (`emscripten_get_now`)
- [x] Ajustar el orden de pasos con `bench` split `dev` (registrar en `disenio.md`)

## F2.5 — Engine TS
**Esfuerzo**: 1 d · **Archivos**: `packages/scanner/src/engine/`
- [x] Carga única, `compileStreaming` con fallback, caché del `WebAssembly.Module`
- [x] Comprobación `sa_abi_version` con error accionable
- [x] Worker interno compartido para `decode()` en main thread (ADR-02), con `worker: false`
- [x] Límite `maxInputPixels` (16 MP) y reducción a 2 560 px en `fast`/`balanced`
- [x] Resolución por `import.meta.url` + override `wasmUrl`/`wasmModule`
- [x] Escritura de `sa_options` en el heap; lectura de resultados; nunca cachear vistas `HEAPU8` (memory growth)
- [x] `configure()` + `init()` según el diseño
- [x] Variante SIMD: medir; solo si mejora ≥ 15 % se publica y se añade detección + carga (si no, se descarta y se registra)
- [x] Error `ENGINE_LOAD_FAILED` con pistas: ABI distinta (versión esperada vs encontrada) y ruta `/.vite/deps/` (sugiere `optimizeDeps.exclude`)
- [x] Opción `engine` (`wasm` | `native` | `auto`, ADR-07)

## F2.6 — Adaptadores de entrada
**Esfuerzo**: 1 d · **Archivos**: `packages/scanner/src/input/`
- [x] Navegador: ImageData, ImageBitmap, VideoFrame (plano Y con `visibleRect`/`layout`; fallback canvas para RGBA/BGRA), img, canvas, OffscreenCanvas, Blob con EXIF
- [x] Node/Bun: Buffer PNG/JPEG (wasm node), objeto `{data,width,height,format}`; WebP → `INVALID_INPUT` con mensaje que sugiere convertir
- [x] Entrada condicional por `exports` (`"browser"` / `"node"` / `"bun"`) para no arrastrar código de Node al navegador

## F2.7 — Validación y `confidence`
**Esfuerzo**: 4h · **Archivos**: `packages/scanner/src/validate.ts`
- [x] Reglas del diseño
- [x] Tests unitarios por formato con casos válidos e inválidos

## F2.8 — API `decode()` + tests
**Esfuerzo**: 1 d · **Archivos**: `packages/scanner/src/decode.ts`, `test/`
- [x] `decode` (con sobrecarga `includeErrors`), `region`, `signal`, `init`, `configure`, tipos exportados
- [x] Snapshot idéntico entre runtimes para PNG/raw; ≥ 98 % para JPEG
- [x] Tests de regresión con samples de ZXing en Node, Bun y Playwright (3 motores)
- [x] Activar `bench/engines/scanai.ts` y correr G2

## F2.9 — Release alpha
**Esfuerzo**: 2h
- [ ] Changeset + primera publicación `0.x.y-alpha.N` (dist-tag `alpha`) con el pipeline de F0.8
- [x] Nota en README: "API inestable"

## Checklist de salida
- [x] Gate G2 cumplido y reporte en `bench/results/`
- [x] Estado actualizado en `docs/roadmap-v1/README.md`

## Estado (2026-10-10)

Implementada. Pendiente: la parte de G2 que compara contra competidores en el dataset real (requiere F1) y la primera publicación `alpha` (requiere las acciones externas de F0).

Resultados y decisiones tomadas al implementar:
- **Paridad WASM ↔ nativo**: el mismo programa (`packages/engine-wasm/test/parity_main.cpp`) compilado con el `c++` del sistema y con em++ da salidas idénticas en las 11 388 combinaciones (949 samples × 4 rotaciones × 3 estrategias). Más estricto que comparar recuentos.
- **Corrección**: `test/integration/samples.test.ts` extrae los umbrales `tryHarder` a 0° de `BlackboxTestRunner.cpp` y exige ≥ en cada set de los 13 formatos: **cumple todos** (p. ej. ean13-2 12 vs 6, upca-2 18 vs 16, qrcode-4 16 vs 15). 0 lecturas en `falsepositives-*`.
- **`text` en modo Plain** (decisión nueva): ZXing v3 usa HRI por defecto (GS1 con paréntesis, controles como `<NUL>`). Plain = `rawValue` de BarcodeDetector y lo que esperan los parsers. HRI disponible con `advanced.textMode`. Añadido `kTextMode` al ABI v1 (aún sin publicar).
- **SIMD descartado** (F2.5): sin mejora consistente (72/86 s y 79/77 s en dos corridas) y con resultados distintos por cambios de redondeo en el preproceso. Una sola variante.
- **Samples WebP**: 509 de los samples son WebP, que `stb_image` no lee; `test/prepare-samples.py` los convierte a PNG para Node. En navegador WebP se decodifica nativamente.
- **Bug encontrado por los tests de navegador**: con memoria crecible, Emscripten 6 usa un ArrayBuffer redimensionable y `TextDecoder` lo rechaza en Chromium/Firefox → lectura del JSON con copia (`cString`).
- Tamaños: WASM navegador 618 KB / **317 KB gzip**, node 642 / 328 KB; JS gzip: entrada navegador 7,4 KB, worker 6,4 KB, node 5,9 KB.
- Tests: 64 en Node (unit + integración + SSR), 3 en Bun, 7 × 2 en navegador (Chromium y Firefox). **WebKit pendiente**: falta `libavif16` en el sistema (`sudo apt-get install libavif16`).

### Correcciones tras el primer benchmark (F1)
- **Multi-código**: la cascada paraba en la primera pasada con lecturas y "fast" suele encontrar solo uno de varios códigos (12 % vs 50 % de zxing-wasm en `multi`). Ahora, con `maxSymbols` > 1, balanced/thorough completan con "harder" y combinan; el preproceso solo corre si no hay lecturas. `maxSymbols: 1` mantiene la salida rápida.
- **Invertidos**: pasada propia con luminancia invertida (27 % → 98,5 % en `inverted`; zxing-wasm 27 %).
- **UPC-A**: ZXing v3 da UPC-A en forma GTIN-13 y como EAN-13 si se piden ambos; el SDK normaliza a `upc_a` de 12 dígitos cuando se pidió `upc_a` (como BarcodeDetector y Quagga2).
- Coste: p95 de balanced sube en imágenes que fallan (más pasadas); acotable con `timeBudgetMs`.
