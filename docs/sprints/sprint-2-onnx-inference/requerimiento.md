# Sprint 2 — Conectar ONNX Runtime Web para inferencia real

**Duración estimada**: 4-5 días
**Prioridad**: Crítico (sin inferencia, los modelos de IA no hacen nada)
**Estado actual**: `onnx_runner.rs` tira `Err("ONNX Runtime native inference not available in wasm build")` para todos los métodos

---

## Requerimiento

Los 5 modelos ONNX (detector, super-res, deblur, perspectiva, autofocus) deben cargarse y ejecutarse en el navegador usando ONNX Runtime Web (MIT). La inferencia debe ser accesible desde Rust vía bridge JS ↔ WASM, con latencia total <11ms para los 5 modelos combinados.

### Lo que debe hacer

1. Cargar modelos ONNX desde URL o ArrayBuffer en el lado JS
2. Ejecutar inferencia para cada uno de los 5 modelos desde Rust
3. Pasar tensores de entrada (imagen preprocesada) desde Rust → JS → ORT Web
4. Recibir tensores de salida (boxes, scores, corners, etc.) desde JS → Rust
5. Soportar ejecución en Web Worker para no bloquear el hilo principal
6. Cachear modelos en IndexedDB/localStorage para no re-descargar

### Lo que NO debe hacer

- NO usar `onnxruntime-node` (solo Node.js, no navegador)
- NO intentar correr ONNX Runtime nativo en WASM (no existe wasm backend maduro para ort crate)
- NO usar WebGL si no está disponible (fallback a WASM backend de ORT)

### Criterios de aceptación

- [ ] `run_detector()` retorna boxes reales para una imagen con código de barras
- [ ] `run_autofocus()` retorna score >0.8 para imagen nítida, <0.3 para borrosa
- [ ] `run_super_resolution()` retorna imagen 128x128 desde input 64x64
- [ ] `run_deblur()` mejora PSNR de imagen borrosa en >5dB
- [ ] `run_perspective()` retorna 8 coordenadas razonables para imagen con código
- [ ] Tiempo total de inferencia <11ms en Chrome M120+ con WebGL
- [ ] Funciona en Web Worker sin acceso al DOM
