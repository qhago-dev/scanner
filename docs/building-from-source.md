# ScanAI SDK — Compilación desde Fuente

## Requisitos del sistema

- Rust 1.75+ con `wasm32-unknown-unknown` target
- Node.js 18+ con npm
- Python 3.10+ (solo para entrenar modelos)
- wasm-pack 0.12+
- CMake 3.20+ (para ZXing-C++)

### Instalar herramientas

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# wasm-pack
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# Node.js
# Usa nvm o descarga desde nodejs.org

# Python (solo para training)
pip install -r training/requirements.txt
```

---

## Compilar el núcleo Rust → WASM

```bash
cd core

# Compilar para web
wasm-pack build --target web --out-dir pkg/web

# Compilar para bundlers (webpack, rollup, vite)
wasm-pack build --target bundler --out-dir pkg/bundler

# Compilar para Node.js
wasm-pack build --target nodejs --out-dir pkg/node
```

Los archivos de salida estarán en `core/pkg/`:
```
core/pkg/web/
  scanai_core_bg.wasm     (~1.5 MB)
  scanai_core.js          (~50 KB)
  scanai_core.d.ts        (tipos TypeScript)

core/pkg/bundler/
  scanai_core_bg.wasm
  scanai_core.js
  scanai_core.d.ts
```

---

## Compilar el SDK JavaScript

```bash
cd sdk

npm install
npm run build
```

Salida en `sdk/dist/`:
```
dist/
  index.js       (CommonJS)
  index.mjs      (ES Module)
  index.d.ts     (tipos)
  index.min.js   (IIFE minificado)
```

---

## Construir el paquete completo

```bash
# Desde la raíz del proyecto

# 1. Compilar WASM
cd core && wasm-pack build --target bundler --out-dir ../sdk/wasm

# 2. Empaquetar SDK
cd ../sdk && npm install && npm run build

# 3. (Opcional) Entrenar modelos
cd ../training
pip install -r requirements.txt
python train/train_detector.py --epochs 100
python export/export_all_onnx.py --checkpoints ./checkpoints --output-dir ../models
```

---

## Estructura del release

```
scanai-sdk-v0.1.0/
├── README.md
├── LICENSE.md
├── CHANGELOG.md
├── sdk/
│   ├── dist/                  # JS compilado
│   │   ├── index.js
│   │   ├── index.mjs
│   │   └── index.d.ts
│   └── wasm/                  # WASM compilado
│       ├── scanai_core_bg.wasm
│       └── scanai_core.js
├── models/                    # Modelos ONNX
│   ├── nanodet_barcode_int8.onnx
│   ├── esrgan_tiny_int8.onnx
│   ├── deblur_int8.onnx
│   ├── perspective_corners.onnx
│   └── autofocus_int8.onnx
├── wrappers/
│   ├── flutter/
│   │   └── lib/scanner.dart
│   ├── react-native/
│   │   └── src/index.ts
│   └── capacitor/
│       └── plugin.ts
└── docs/
    ├── integration.md
    ├── api-reference.md
    ├── model-training.md
    └── building-from-source.md
```

---

## Compilar para Android (nativo)

```bash
# Añadir targets Android
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android

# Instalar Android NDK
export ANDROID_NDK_HOME=/path/to/android-ndk

# Compilar
cd core
cargo ndk -t armeabi-v7a -t arm64-v8a -t x86_64 -o ../android/app/src/main/jniLibs build --release
```

## Compilar para iOS (nativo)

```bash
# Añadir targets iOS
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios

# Compilar
cd core
cargo build --release --target aarch64-apple-ios

# Crear XCFramework
xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios/release/libscanai_core.a \
  -output ../ios/ScanAI.xcframework
```

---

## Compilar ZXing-C++ a WebAssembly

ZXing-C++ (Apache 2.0) se compila a WASM usando Emscripten:

```bash
# Clonar ZXing-C++
git clone https://github.com/zxing-cpp/zxing-cpp.git
cd zxing-cpp

# Compilar con Emscripten
mkdir build-wasm && cd build-wasm
emcmake cmake .. -DBUILD_SHARED_LIBS=OFF
emmake make -j$(nproc)

# El archivo .wasm estará en build-wasm/
```

---

## Pruebas

```bash
# Ejecutar tests del núcleo Rust
cd core
cargo test

# Ejecutar tests del SDK JS
cd sdk
npm test

# Ejecutar benchmark
cd benchmarks/compare_quaggajs
npm run benchmark
```

---

## Variables de entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `SCANAI_MODELS_CDN` | URL base para modelos ONNX | `https://cdn.scanai.dev/models/v1` |
| `SCANAI_WASM_CDN` | URL base para archivos WASM | `https://cdn.scanai.dev/wasm` |
