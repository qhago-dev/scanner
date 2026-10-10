# ScanAI SDK — Plan de Implementación por Fases

## Resumen ejecutivo

SDK de escaneo de códigos de barras multiplataforma (Web, iOS, Android) que utiliza IA moderna para preprocesar imágenes antes de delegar la decodificación en ZXing-C++ (Apache 2.0). Todas las dependencias usan licencias permisivas (MIT, Apache 2.0, BSD). El SDK es completamente comercializable sin obligación de liberar código fuente.

---

## Fase 0: Fundamentos y compliance (Semana 1-2)

### 0.1 Auditoría de licencias
- Verificar cada dependencia contra la lista de licencias prohibidas (AGPL, GPLv3, LGPL con restricciones)
- Documentar compliance en `COMPLIANCE.md`
- Prohibido explícitamente: Ultralytics YOLO (AGPL-3.0), modelos derivados de su repo

### 0.2 Setup del monorepo
- Estructura de directorios
- Toolchain Rust (wasm-pack, cargo) + Python (PyTorch, ONNX) + Node.js
- CI/CD con GitHub Actions para compilar Wasm y modelos ONNX

### 0.3 Dataset sintético base
- Generador de códigos de barras sintéticos (barcode, qr, datamatrix, pdf417)
- 100k imágenes con variaciones: rotación, perspectiva, blur, ruido, iluminación, oclusión parcial
- Dataset de benchmark contra QuaggaJS: 5k imágenes en 10 escenarios adversos

---

## Fase 1: Modelos de IA (Semanas 3-6)

### 1.1 Detector de códigos de barras (NanoDet)
- **Arquitectura**: NanoDet-Plus (Apache 2.0), modificado para 4 clases
- **Clases**: barcode_1d, qr_code, datamatrix, pdf417
- **Input**: 320×320, 3 canales
- **Output**: bounding boxes + confianza + clase
- **Target**: <5ms en GPU mobile, <15ms en CPU mobile
- **Training**: 100k imágenes sintéticas + augmentación
- **Export**: ONNX con cuantización INT8

### 1.2 Super-resolución (ESRGAN Tiny)
- **Arquitectura**: ESRGAN reducido (8 RRDB blocks → 3, canales 64→32)
- **Input**: 64×64 patch de código de barras
- **Output**: 128×128 (2× upscale)
- **Tamaño**: <1 MB cuantizado
- **Training**: Pares low-res/high-res de códigos de barras sintéticos
- **Export**: ONNX INT8

### 1.3 Deblurring CNN
- **Arquitectura**: UNet ligero (3 niveles, canales 32→64→128)
- **Input**: 128×128 patch con motion blur / defocus blur
- **Output**: 128×128 deblurred
- **Training**: Pares blur/sharp de códigos sintéticos con kernels de blur variados
- **Export**: ONNX INT8

### 1.4 Corrección de perspectiva
- **Arquitectura**: MobileNetV3-Small backbone + 8 outputs (4 esquinas x,y)
- **Input**: 128×128
- **Output**: 8 valores normalizados [0,1] para las 4 esquinas
- **Training**: Imágenes con perspectiva aleatoria + ground truth de esquinas
- **Export**: ONNX FP16

### 1.5 Clasificador de enfoque (Autofocus)
- **Arquitectura**: MobileNetV3-Small (clasificación binaria)
- **Input**: 128×128 crop central
- **Output**: probabilidad de "enfocada" [0,1]
- **Training**: Pares focused/blurred de códigos sintéticos
- **Export**: ONNX INT8

---

## Fase 2: Núcleo Rust/Wasm (Semanas 5-8)

### 2.1 ONNX Runtime wrapper
- Abstracción sobre `ort` crate (Rust bindings para ONNX Runtime)
- Carga de modelos desde ArrayBuffer (Wasm) o filesystem (nativo)
- Gestión de memoria: arena allocator para tensores
- Soporte para ONNX Runtime Web (Wasm) y ONNX Runtime Mobile (Android/iOS)

### 2.2 Pipeline de inferencia
- Orquestación secuencial con early-exit:
  1. Autofocus check → si desenfocado, skip decode
  2. Detección → si no hay barcode, skip
  3. Crop ROI → si muy pequeño, aplicar SR
  4. Deblur → si blur score alto
  5. Perspective correction → si inclinación detectada
  6. Decode ZXing → intentar todas las simbologías configuradas

### 2.3 Tracking adaptativo
- Algoritmo propio: diferencia de frames + tracking de ROI
- Solo re-ejecuta pipeline completo si:
  - Desplazamiento del ROI > 20%
  - Cambio significativo en histograma de la ROI
  - Timeout de re-esaneo (500ms)
- En modo tracking: solo decodifica, sin re-ejecutar detección

### 2.4 Compilación a Wasm
- `wasm-pack build --target web` para web
- `wasm-pack build --target bundler` para Node.js/bundlers
- Tamaño target: <2 MB (modelos cargados por separado)

### 2.5 Bindings nativos
- `uniffi` para generar bindings Kotlin (Android) y Swift (iOS)
- AAR para Android, XCFramework para iOS

---

## Fase 3: Wrappers de SDK (Semanas 7-10)

### 3.1 JavaScript/TypeScript (Web)
- API principal: `AIScanner` class
- Eventos: `onDecode`, `onError`, `onTracking`, `onFocusChange`
- Carga progresiva de modelos (lazy loading)
- Worker thread para inferencia (no bloquea UI)
- Tipos completos en TypeScript

### 3.2 Flutter
- Plugin Flutter con MethodChannel al native
- API Dart idéntica a JS
- Soporte para CameraController integration

### 3.3 React Native
- Native module con bridge a la lib nativa
- API JS/TS idéntica
- Componente `<ScanAICamera>` listo para usar

### 3.4 Capacitor
- Plugin Capacitor 6
- Web fallback (usa Wasm directamente si no hay native)
- API idéntica

---

## Fase 4: Benchmarking y validación (Semanas 9-11)

### 4.1 Dataset de benchmark
- 5,000 imágenes en 10 escenarios:
  1. Luz normal (baseline)
  2. Baja iluminación (<50 lux)
  3. Movimiento (motion blur)
  4. Códigos arrugados/doblados
  5. Perspectiva extrema (>45°)
  6. Códigos parcialmente ocluidos
  7. Códigos pequeños (<50px)
  8. Múltiples códigos en frame
  9. Reflexión/brillo en pantalla
  10. Combinación adversa (borroso + inclinado + poca luz)

### 4.2 Suite de benchmark
- Runner que compara ScanAI vs QuaggaJS en mismos inputs
- Métricas: success rate, tiempo de decodificación, consumo de batería
- Reporte automatizado en HTML/Markdown

### 4.3 Metas comerciales (KPIs)
| Métrica | QuaggaJS | ScanAI Target |
|---------|----------|---------------|
| Velocidad media | ~200ms | <100ms (2× más rápido) |
| Tasa éxito normal | ~85% | >95% |
| Tasa éxito adverso | ~40% | >70% (30%+ mejora) |
| Consumo batería (1h) | ~15% | <10% |

---

## Fase 5: Empaquetado y release (Semanas 10-12)

### 5.1 Artefactos de release
- `@scanai/sdk` — npm package (JS/TS)
- `scanai_flutter` — pub.dev package
- `react-native-scanai` — npm package
- `@scanai/capacitor` — npm package
- `libscanai_core` — Rust crate (crates.io)

### 5.2 Modelos pre-entrenados
- Distribución vía CDN (modelos ONNX)
- Versionado semántico de modelos
- Descarga bajo demanda con caché

### 5.3 Documentación
- Guía de integración rápida (5 min)
- API reference completa
- Guía de entrenamiento de modelos propios
- Guía de compilación desde fuente

---

## Dependencias y licencias (resumen)

| Dependencia | Licencia | Uso |
|-------------|----------|-----|
| NanoDet | Apache 2.0 | Arquitectura base del detector |
| PyTorch | BSD | Training de modelos |
| ONNX Runtime | MIT | Inferencia |
| ZXing-C++ | Apache 2.0 | Decodificación |
| wasm-pack | MIT/Apache 2.0 | Compilación Rust→Wasm |
| ort (crate) | MIT | Rust bindings ONNX |
| image (crate) | MIT | Procesamiento de imágenes |
| opencv-rust | MIT | Operaciones de warp perspective |

**Prohibido explícitamente**: Ultralytics YOLO (AGPL-3.0), cualquier modelo derivado de su repositorio, GNU GPLv3, GNU AGPLv3.

---

## Estructura de archivos

```
ScanAI-SDK/
├── ARCHITECTURE.md           # Arquitectura técnica detallada
├── PHASE_PLAN.md             # Este archivo
├── COMPLIANCE.md             # Auditoría de licencias
├── LICENSE.md                # MIT
├── Makefile                  # Comandos de build
├── core/                     # Núcleo Rust
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs            # Punto de entrada
│       ├── pipeline.rs       # Orquestación del pipeline
│       ├── onnx_runner.rs    # Wrapper ONNX Runtime
│       ├── detection.rs      # Detector de barcodes
│       ├── super_resolution.rs
│       ├── deblur.rs
│       ├── perspective.rs
│       ├── decoding.rs       # ZXing-C++ wrapper
│       ├── tracking.rs       # Tracking adaptativo
│       ├── autofocus.rs      # Clasificador de enfoque
│       ├── types.rs          # Tipos compartidos
│       └── wasm_bindings.rs  # Bindings JS/Wasm
├── training/                 # Python - entrenamiento
│   ├── requirements.txt
│   ├── models/               # Definiciones de arquitecturas
│   ├── train/                # Scripts de entrenamiento
│   ├── export/               # Exportación a ONNX
│   ├── data/                 # Generación de datasets
│   └── benchmarks/           # Benchmarks de modelos
├── sdk/                      # Wrapper JS/TS
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
├── wrappers/                 # Wrappers nativos
│   ├── flutter/
│   ├── react-native/
│   └── capacitor/
├── benchmarks/               # Benchmark vs QuaggaJS
├── models/                   # Modelos ONNX pre-entrenados (placeholder)
└── docs/                     # Documentación
```
