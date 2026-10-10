# Fase 2 — Motor de decodificación

**Esfuerzo**: 6-8 días · **Prioridad**: Bloqueante · **Depende de**: F0 · **Versión**: pre-tag `alpha`

## Problema

El bridge actual de ZXing devuelve solo texto, una simbología por llamada y un código por imagen; los datos cruzan JS↔WASM en base64. No hay API usable fuera de la demo, ni soporte Node/Bun.

## Requerimiento

Una función `decode()` universal, rápida y rica en información, construida sobre un único módulo WASM (ADR-01) con preproceso clásico.

### Debe

1. **Bridge C++ nuevo** sobre `ZXing::ReadBarcodes` que devuelva por código: formato, texto, bytes crudos, 4 esquinas, orientación, `isMirrored`, `isInverted`, nivel EC, identificador de simbología, `contentType` (texto/binario/GS1/ISO 15434), y estado de error.
2. **Opciones** expuestas: formatos, `tryHarder`, `tryRotate`, `tryInvert`, `tryDownscale`, `binarizer`, `maxSymbols`, `minLineCount` (1D), `isPure`, `textMode`, `eanAddOnSymbol`, `returnErrors` (devuelve la posición de símbolos detectados que no se pudieron decodificar; los usa el tracker de F3; `decode()` público solo los devuelve con `includeErrors: true` y como tipo aparte `DecodeCandidate`, nunca como `BarcodeResult`).
3. **Paso de memoria sin copias extra**: buffer reutilizable en el heap WASM; luminancia (1 byte/px) o RGBA convertida en C++ con BT.601.
4. **Preproceso clásico** en C++ (todo opcional y combinable):
   - Normalización de contraste local (CLAHE) para `low_light`/`glare`.
   - Unsharp mask suave para desenfoque leve.
   - Reintento multi-escala (1×, 0,5×, 2× bicúbico) y recortes centrales.
   - Estrategia en cascada con presupuesto de tiempo: rápido → intensivo, parando al primer éxito.
5. **Validación post-lectura**: checksum de EAN/UPC (ZXing), ITF y Code39 mod43 opcionales; filtro de longitud mínima por formato; `confidence` heurística basada solo en lo que ZXing expone (ver diseño). Antes de fijar la fórmula, F2.2 inventaría qué campos expone `ZXing::Barcode` en el tag fijado.
6. **API TS** `decode(input, options)` que acepte `ImageData`, `ImageBitmap`, `HTMLImageElement`, `HTMLCanvasElement`, `OffscreenCanvas`, `VideoFrame`, `Blob`/`File`, objeto `{data,width,height,format}`, y en Node/Bun `Buffer`/`Uint8Array` con PNG/JPEG (WebP en Node/Bun no se soporta en 1.0; se documenta convertir antes, p. ej. con `sharp`).
7. Funciona en las plataformas de "Plataformas soportadas" (README del roadmap): main thread (delegando en worker interno, ADR-02), Web Worker, Node, Bun; Deno best effort.
8. **Límite de tamaño de entrada**: imágenes con lado mayor > 2 560 px se reducen antes de `fast`/`balanced` (la memoria WASM crece y no se libera); `thorough` procesa recortes a resolución nativa. Límite duro configurable (`maxInputPixels`, default 16 MP, por debajo del máximo de canvas de iOS Safari ~16,7 MP) → `ScanError("INVALID_INPUT")`.
9. Inicialización perezosa y única (`init()` opcional; `decode()` la dispara), con comprobación de versión ABI JS↔WASM (ADR-06).
10. **Errores tipados desde esta fase**: se crea `ScanError` con la unión completa de códigos (`PERMISSION_DENIED`, `NO_CAMERA`, `CAMERA_IN_USE`, `INSECURE_CONTEXT`, `UNSUPPORTED`, `ENGINE_LOAD_FAILED`, `INVALID_INPUT`, `ABORTED`). F4 solo la revisa y documenta.
11. **Formatos de 1.0**: exactamente los 13 de la DoD. DataBar, MicroQR y rMQR quedan para post-1.0 (F8) y no aparecen en el tipo `BarcodeFormat`.

### No debe

- Incluir lectores de escritura (writers) ni código de generación: build solo lectores.
- Usar Rust ni pasar imágenes o tensores en base64 (solo los bytes del resultado, que son pocos, pueden ir en base64 dentro del JSON).
- Bloquear más de una vez la carga del WASM (cachear `WebAssembly.Module`).

## Criterios de aceptación (gate G2)

- [ ] Paridad con ZXing-C++ nativo: se compilan y ejecutan los blackbox tests nativos del mismo tag y se guarda como línea base la tabla `(muestra, rotación, modo) → leído sí/no`. Con las mismas opciones (`tryHarder`/`isPure` por modo), el motor WASM lee **cada entrada** que lee el nativo (diferencias = 0, salvo excepciones justificadas en el reporte).
- [ ] En `bench` split `test` (imágenes), con las definiciones de "no peor"/"mejor" del README: recall no peor que `zxing-wasm` en ningún escenario, mejor que Quagga2 en 1D global; false_read_rate y negatives_fp no peores que el mejor competidor.
- [ ] `decode()` de una imagen 1280×720 sin código, estrategia `fast`, en `desktop-ref`: p50 ≤ 1,2 × el de `zxing-wasm` en la misma máquina (comparación relativa; el valor absoluto se registra).
- [ ] `.wasm` de navegador ≤ 450 KB gzip, o justificación medida si ZXing solo-lectores ya lo supera (se fija el presupuesto definitivo de F6 aquí).
- [ ] Resultados idénticos en Chromium, Firefox, WebKit, Node y Bun para entradas **PNG y `{data,width,height}`** del set de regresión. Para JPEG (los decoders difieren en IDCT/upsampling) se exige ≥ 98 % de coincidencia por runtime y se reportan las diferencias.
- [ ] Un PNG/JPEG en Node y Bun se decodifica sin dependencias nativas.
