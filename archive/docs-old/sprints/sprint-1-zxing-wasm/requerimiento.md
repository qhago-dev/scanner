# Sprint 1 — Integrar ZXing-C++ real

**Duración estimada**: 3-4 días
**Prioridad**: Crítico (bloquea todo el pipeline de decodificación)
**Estado actual**: `decoding.rs:40` retorna `None` siempre

---

## Requerimiento

El módulo `decoding.rs` debe invocar ZXing-C++ (Apache 2.0) compilado a WebAssembly para decodificar códigos de barras 1D y 2D desde la imagen preprocesada (grayscale, corregida, nítida).

### Lo que debe hacer

1. Recibir un buffer `&[u8]` en grayscale + ancho + alto + lista de simbologías
2. Para cada simbología, invocar ZXing-C++ y retornar el primer resultado exitoso
3. Soportar 13 formatos: Code128, Code39, Code93, EAN-8, EAN-13, UPC-A, UPC-E, ITF, Codabar, QR, DataMatrix, PDF417, Aztec
4. Llamable desde Rust (vía FFI o WASM) en <5ms para imágenes <256x256

### Lo que NO debe hacer

- NO usar ZXing-JS (es port incompleto, sin soporte 2D completo)
- NO hacer binding a librerías C++ nativas (rompe la portabilidad WASM)
- NO reimplementar decodificación propia (ZXing-C++ ya está validado en millones de dispositivos)

### Criterios de aceptación

- [ ] `zxing_decode_one()` en `decoding.rs` retorna `Some(texto)` para una imagen válida
- [ ] Decodifica Code128 y QR Code con >95% de precisión en el dataset sintético
- [ ] Tiempo de decodificación <5ms por intento en imágenes <256x256
- [ ] No introduce dependencias con licencia restrictiva
- [ ] El .wasm de ZXing se carga sin errores en Chrome, Firefox y Safari
