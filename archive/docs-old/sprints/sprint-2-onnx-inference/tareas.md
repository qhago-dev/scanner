# Sprint 2 — Lista de tareas

## T2.1 — Instalar y configurar onnxruntime-web

**Esfuerzo**: 2h
**Archivos**: `sdk/`

- [ ] `npm install onnxruntime-web` (MIT, ~4 MB)
- [ ] Configurar bundler (rollup) para copiar `ort-wasm*.wasm` a `dist/`
- [ ] Agregar `ort-wasm-simd.wasm` y `ort-wasm-threaded.wasm` al output
- [ ] Verificar que `ort.InferenceSession.create()` funciona en Chrome
- [ ] Verificar fallback a WASM backend cuando WebGL no está disponible

## T2.2 — Crear OnnxBridge en TypeScript

**Esfuerzo**: 6h
**Archivos**: `sdk/src/onnx-bridge.ts`

- [ ] Implementar `class OnnxBridge` con `loadModel(id, bytes)`, `runSession(...)`, `destroyModel(id)`
- [ ] Mapear ModelType → ID numérico (0=Detector, 1=SR, 2=Deblur, 3=Perspective, 4=Autofocus)
- [ ] Cachear sesiones en `Map<number, ort.InferenceSession>`
- [ ] Manejar arquitecturas de entrada/salida diferentes por modelo
- [ ] Exportar funciones como globals para que WASM las importe:
  - `ort_load_model(model_id, bytes_ptr, bytes_len)`
  - `ort_run_session(model_id, input_ptr, input_len, shape_ptr, shape_len) → output_ptr`
  - `ort_free_model(model_id)`
- [ ] Manejar errores de ORT y propagarlos como excepciones JS

## T2.3 — Refactorizar OnnxRunner en Rust

**Esfuerzo**: 6h
**Archivos**: `core/src/onnx_runner.rs`

- [ ] Eliminar código `#[cfg(feature = "native")]` con `ort` crate (no usado en WASM)
- [ ] Reemplazar struct `ModelBytes` por `model_ids: HashMap<ModelType, u32>`
- [ ] Implementar `load_models()` → llama a `ort_load_model()` vía wasm-bindgen
- [ ] Implementar `run_detector()` → serializa input → llama `ort_run_session()` → deserializa
- [ ] Implementar `run_super_resolution()`, `run_deblur()`, `run_perspective()`, `run_autofocus()`
- [ ] Cada método: serializa tensor a `Vec<f32>` → pasa puntero → recibe puntero → deserializa
- [ ] Manejar diferentes shapes de output: detector=[N,4],[N],[N], SR=[1,3,128,128], etc.

## T2.4 — Comunicación de memoria Rust ↔ JS

**Esfuerzo**: 4h
**Archivos**: `core/src/onnx_runner.rs`, `sdk/src/onnx-bridge.ts`

- [ ] Rust: alocar buffers en el heap WASM (usando `Vec::into_raw_parts` o `Box::into_raw`)
- [ ] Rust: liberar buffers después de leer resultados
- [ ] JS: leer `Float32Array` desde `HEAPU8.buffer` de WASM usando offsets
- [ ] JS: escribir outputs de vuelta al heap WASM
- [ ] Verificar que no hay memory leaks (cada alloc tiene su free)
- [ ] Agregar logs de tamaño de tensores para debugging

## T2.5 — Pipeline end-to-end con un modelo real

**Esfuerzo**: 4h
**Archivos**: `core/src/pipeline.rs`

- [ ] Entrenar o descargar un modelo ONNX de prueba (un MobileNetV3-Small pre-entrenado cualquiera)
- [ ] Cargar el modelo en el pipeline
- [ ] Pasar una imagen real por `process_frame()` y verificar que:
  - `run_autofocus()` retorna un float
  - `run_detector()` retorna arrays no vacíos
  - Los shapes de entrada/salida coinciden con lo esperado
- [ ] Medir latencia real de cada etapa del pipeline
- [ ] Comparar contra los targets de <11ms total

## T2.6 — Web Worker opcional

**Esfuerzo**: 4h
**Archivos**: `sdk/src/scanai-worker.ts`

- [ ] Crear worker que cargue ORT y ejecute inferencia en thread separado
- [ ] Comunicación vía `postMessage`: frame in → resultado out
- [ ] `AIScanner` detecta si debe usar worker (`workerPath` configurado) o main thread
- [ ] Manejar transferencia de buffers con `transferList` para zero-copy

---

## Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| `onnxruntime-web` no carga en Firefox (sin WebGL) | Medio | WASM backend es universal, verificar en CI |
| Diferentes versiones de ORT esperan diferentes opset | Medio | Exportar ONNX con opset 13 (máxima compatibilidad) |
| Fuga de memoria WASM al no liberar buffers | Alto | Usar patrón RAII con `Drop` en Rust para liberar |
| Modelos grandes (>10 MB) causan timeout en carga | Bajo | Mostrar progreso de carga, streaming con `fetch` |

## Definición de Done

- [ ] `make build-core` compila con bridge ORT Web funcional
- [ ] Se carga un modelo ONNX real desde ArrayBuffer
- [ ] `run_detector()` retorna datos reales (no mock/hardcodeado)
- [ ] Pipeline completo ejecuta 5 modelos sin crash
- [ ] No hay `panic!` ni `unwrap()` sin manejar en el path de inferencia
- [ ] `onnx_runner.rs` NO tiene `Err("not available in wasm build")`
