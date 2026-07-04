# Sprint 7 — Producción: tests, CI/CD, paquetes, publicación

**Duración estimada**: 4-5 días
**Prioridad**: Media (necesario para release público)
**Depende de**: Sprints 1-6 completados

---

## Requerimiento

Preparar el SDK para release público: tests unitarios y de integración, CI/CD automatizado, publicación en npm/pub.dev, documentación final, y manejo de errores robusto.

---

## Tareas

### T7.1 — Tests unitarios Rust

**Esfuerzo**: 4h
**Archivos**: `core/tests/` (nuevo)

- [ ] `decoding_test.rs`: decodificar 50 imágenes sintéticas, verificar tasa >95%
- [ ] `detection_test.rs`: detectar bounding boxes en 50 imágenes, IoU >0.7 con ground truth
- [ ] `preprocessor_test.rs`: SR y deblur mejoran métricas de calidad
- [ ] `perspective_test.rs`: warp corrige perspectiva, MAE de esquinas <5px
- [ ] `tracking_test.rs`: mismo ROI → skip, ROI cambiado → full pipeline
- [ ] `pipeline_test.rs`: end-to-end con modelos reales, sin crash, sin memory leak

### T7.2 — Tests unitarios JS

**Esfuerzo**: 3h
**Archivos**: `sdk/tests/` (nuevo)

- [ ] `AIScanner.test.ts`: constructor, listeners, start/stop/destroy
- [ ] `wasm-loader.test.ts`: carga de WASM, inicialización, terminación
- [ ] `onnx-bridge.test.ts`: carga de modelo, inferencia, descarga
- [ ] Framework: Jest o Vitest con entorno jsdom

### T7.3 — Manejo de errores robusto

**Esfuerzo**: 4h

- [ ] Reemplazar todos los `unwrap()` y `expect()` por `Result` con mensajes claros
- [ ] Agregar `thiserror` crate para errores tipados en Rust
- [ ] Agregar `ScanAIError` class en TypeScript con códigos de error
- [ ] Manejar fallos de red al descargar modelos (retry 3× con backoff)
- [ ] Manejar fallos de cámara (permiso denegado, no disponible)
- [ ] Manejar modelos corruptos (hash verification)

### T7.4 — CI/CD con GitHub Actions

**Esfuerzo**: 4h
**Archivos**: `.github/workflows/` (nuevo)

- [ ] Workflow `build.yml`: compila Rust → WASM, compila JS SDK, corre tests
- [ ] Workflow `benchmark.yml`: corre benchmark vs QuaggaJS, publica resultados
- [ ] Workflow `publish.yml`: publica a npm en cada tag `v*`
- [ ] Workflow `lint.yml`: clippy (Rust) + eslint (JS) + typecheck

### T7.5 — Publicar paquetes

**Esfuerzo**: 3h

- [ ] Publicar `@scanai/sdk` en npm (JS/TS para Web)
- [ ] Publicar `react-native-scanai` en npm
- [ ] Publicar `@scanai/capacitor` en npm
- [ ] Publicar `scanai_sdk` en pub.dev (Flutter)
- [ ] Documentar versionado semántico: modelos v1, SDK v0.x

### T7.6 — Documentación final

**Esfuerzo**: 4h

- [ ] Agregar CHANGELOG.md con historial de versiones
- [ ] Agregar guía de migración (si hay breaking changes)
- [ ] Agregar ejemplos completos: `examples/web/`, `examples/flutter/`
- [ ] Grabar demo de 30 segundos para el README
- [ ] Actualizar benchmarks en README con datos reales del sprint 5

### T7.7 — Seguridad

**Esfuerzo**: 2h

- [ ] Verificar que no se loguean datos de códigos escaneados
- [ ] Verificar que los modelos .onnx no contienen rutas absolutas ni secrets
- [ ] `cargo audit` para vulnerabilidades en dependencias Rust
- [ ] `npm audit` para vulnerabilidades en dependencias JS
- [ ] Content Security Policy: verificar que WASM carga con CSP razonable

---

## Definición de Done (release v0.1.0)

- [ ] Todos los tests pasan (`make test`)
- [ ] CI/CD verde en GitHub Actions
- [ ] Paquetes publicados en npm y pub.dev
- [ ] Documentación completa (README, API ref, integration guide)
- [ ] Demo funcional en `examples/web/`
- [ ] No hay `unwrap()`, `panic!`, o `console.error` sin manejar
- [ ] `cargo audit && npm audit` limpios
- [ ] Los 5 modelos ONNX servidos desde CDN con CORS
- [ ] CHANGELOG.md con entradas de v0.1.0
