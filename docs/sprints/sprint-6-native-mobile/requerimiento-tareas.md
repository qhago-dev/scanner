# Sprint 6 — Librerías nativas Android e iOS

**Duración estimada**: 5-7 días
**Prioridad**: Media (el WASM ya funciona en WebView, nativo es para máximo rendimiento)
**Depende de**: Sprint 1 (ZXing), Sprint 2 (ONNX), Sprint 3 (modelos)

---

## Requerimiento

Compilar el núcleo Rust como librería nativa `.so` (Android) y `.a` (iOS), integrar ONNX Runtime Mobile (MIT, ~3 MB), y exponer la misma API del SDK via FFI para Kotlin/Swift.

### Lo que debe hacer

1. Compilar `core/` con target `aarch64-linux-android` + `armv7-linux-androideabi`
2. Compilar `core/` con target `aarch64-apple-ios` (solo arm64, iOS descartó 32-bit)
3. Usar ONNX Runtime Mobile (no Web) para inferencia nativa
4. Exponer API C (`extern "C"`) desde Rust para Kotlin/Swift
5. Generar bindings Kotlin con `uniffi` o JNI manual
6. Generar bindings Swift con `cbindgen` o `uniffi`
7. Empaquetar como AAR (Android) y XCFramework (iOS)

### Lo que NO debe hacer

- NO re-escribir el core en Kotlin/Swift (la lógica debe estar en Rust, single source of truth)
- NO usar `ort` crate nativo a menos que esté estable (v2.0 es aún RC)

---

## Tareas

### T6.1 — Compilar Rust para Android

**Esfuerzo**: 4h
- [ ] Instalar Android NDK r26+
- [ ] `rustup target add aarch64-linux-android armv7-linux-androideabi`
- [ ] Configurar `cargo-ndk`
- [ ] Compilar `cargo ndk --target arm64-v8a --target armeabi-v7a -o ../android/libs build --release`
- [ ] Verificar que `libscanai_core.so` se genera (~500 KB)

### T6.2 — Compilar Rust para iOS

**Esfuerzo**: 3h
- [ ] `rustup target add aarch64-apple-ios`
- [ ] Compilar `cargo build --release --target aarch64-apple-ios`
- [ ] Crear header C con `cbindgen`
- [ ] Empaquetar como `.xcframework`

### T6.3 — API C desde Rust

**Esfuerzo**: 4h
**Archivos**: `core/src/ffi.rs` (nuevo)

- [ ] Exponer `extern "C"` functions: `scanai_init`, `scanai_process_frame`, `scanai_destroy`
- [ ] Manejar ownership: el caller nativo debe liberar con `scanai_destroy`
- [ ] Serializar resultados como JSON string (mismo formato que eventos WASM)

### T6.4 — Bindings Kotlin (Android)

**Esfuerzo**: 4h
- [ ] JNI wrapper: `class AIScanner { fun processFrame(...): BarcodeResult }`
- [ ] CameraX integration: conectar flujo de cámara a `processFrame`
- [ ] Empaquetar como AAR con Gradle

### T6.5 — Bindings Swift (iOS)

**Esfuerzo**: 4h
- [ ] Bridging header para funciones C
- [ ] Swift wrapper: `class AIScanner { func processFrame(...) -> BarcodeResult? }`
- [ ] AVFoundation integration: `AVCaptureVideoDataOutput` → `processFrame`

### T6.6 — Integrar ONNX Runtime Mobile

**Esfuerzo**: 4h
- [ ] Android: agregar `onnxruntime-android` AAR como dependencia
- [ ] iOS: agregar `onnxruntime-ios` pod
- [ ] Cargar modelos .onnx desde assets/bundle
- [ ] El feature `native` de Rust debe usar `ort` crate (v2.0.0-rc.12)

---

## Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| `ort` crate v2 aún es RC, puede tener bugs | Alto | Feature-gate: si falla, usar ORT Mobile via JNI/FFI directo |
| `cargo-ndk` issues con NDK 27+ | Medio | Usar NDK 26 LTS |
| iOS requiere llvm-bitcode o firmado especial | Bajo | Xcode 15+ maneja esto automáticamente |
