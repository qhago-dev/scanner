# Sprint 1 — Lista de tareas

## T1.1 — Instalar Emscripten y compilar ZXing-C++

**Esfuerzo**: 3h
**Responsable**: Backend
**Archivos**: `core/zxing/`

- [ ] Instalar Emscripten 3.1+ (`emsdk install latest && emsdk activate latest`)
- [ ] Clonar zxing-cpp v2.2+ (`git clone https://github.com/zxing-cpp/zxing-cpp.git --depth 1`)
- [ ] Crear `zxing_bridge.c` (wrapper C mínimo sobre ZXing::ReadBarcode)
- [ ] Compilar con `emcmake cmake .. && emmake make -j$(nproc)`
- [ ] Generar `zxing_barcode.wasm` + `zxing_barcode.js` con `emcc`
- [ ] Verificar tamaño (<600 KB con -O3)
- [ ] Verificar que `zxing_read_barcode` aparece en exports

## T1.2 — Binding Rust ↔ ZXing

**Esfuerzo**: 4h
**Responsable**: Backend
**Archivos**: `core/src/decoding.rs`

- [ ] Agregar `#[wasm_bindgen(module = "...")]` extern block con la firma C
- [ ] Implementar `decode_one()` real (reemplazar `return None`)
- [ ] Manejar el caso de formatos: traducir `Symbology` → string de ZXing
- [ ] Manejar errores: retorno -1 (error interno ZXing), 0 (no encontrado)
- [ ] Limpiar el módulo `decoding.rs` (remover `ZxingDecoder` struct vacío)
- [ ] Agregar test unitario: imagen sintética → decodificación exitosa

## T1.3 — Integrar carga de WASM dual

**Esfuerzo**: 4h
**Responsable**: Backend + Frontend
**Archivos**: `core/`, `sdk/src/wasm-loader.ts`

- [ ] En `wasm-loader.ts`: agregar paso de carga para `zxing_barcode.wasm`
- [ ] Compartir `WebAssembly.Memory` entre ambos módulos (core + zxing)
- [ ] Pasar funciones exportadas de zxing al core como imports
- [ ] Manejar inicialización asíncrona de ambos módulos
- [ ] Verificar que ambos módulos comparten el mismo heap

## T1.4 — Pruebas de decodificación

**Esfuerzo**: 3h
**Responsable**: QA
**Archivos**: `core/tests/decoding_test.rs`

- [ ] Generar imágenes de prueba con `python-barcode` y `qrcode` (MIT)
- [ ] Probar Code128: 50 códigos sintéticos → 100% decodificados
- [ ] Probar QR: 50 QR sintéticos → 100% decodificados
- [ ] Probar EAN-13, Code39, DataMatrix, PDF417
- [ ] Probar fallback: sin código → `None`
- [ ] Probar múltiples formatos en secuencia (primero QR, luego Code128, etc.)
- [ ] Medir latencia: <5ms por intento en 256x256

## T1.5 — Documentación

**Esfuerzo**: 2h
**Responsable**: Backend
**Archivos**: `docs/sprints/sprint-1-zxing-wasm/`

- [ ] Documentar pasos de compilación de ZXing-C++ → WASM
- [ ] Documentar el contrato de la API C
- [ ] Actualizar `COMPLIANCE.md`: agregar ZXing-C++ (Apache 2.0) a la auditoría
- [ ] Agregar al `Makefile`: target `build-zxing`

---

## Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| ZXing-C++ no compila a WASM con Emscripten | Alto | Usar branch estable v2.2.1, no master |
| Conflicto entre memoria de Emscripten y wasm-bindgen | Medio | Usar `--shared-memory` en ambos o memoria separada con copia |
| Tamaño del .wasm >1 MB | Bajo | `-Os`, strip de símbolos, solo compilar readers necesarios |
| ZXing-C++ requiere excepciones C++ | Medio | Activar `-s DISABLE_EXCEPTION_CATCHING=0` en emcc |

---

## Definición de Done

- [ ] `make build-zxing` compila sin errores
- [ ] `make test-core` pasa todos los tests de decodificación
- [ ] `decoding.rs` llama a `extern "C" fn zxing_read_barcode` real
- [ ] Se decodifica Code128 y QR exitosamente desde Rust
- [ ] No hay `return None` hardcodeado en `decoding.rs`
- [ ] El .wasm de ZXing se sirve con MIME type `application/wasm`
