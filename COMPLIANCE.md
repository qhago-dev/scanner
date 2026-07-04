# ScanAI SDK — Auditoría de Compliance de Licencias

## Principio rector

El SDK debe ser **completamente comercializable sin obligación de liberar código fuente**. Esto significa que ninguna dependencia puede tener licencias copyleft fuertes (AGPL, GPLv3) ni débiles que obliguen a publicar el código del producto final.

---

## Licencias permitidas (whitelist)

| Licencia | SPDX | Tipo | Uso en ScanAI |
|----------|------|------|---------------|
| MIT | MIT | Permisiva | Core SDK, wrappers, modelos propios |
| Apache 2.0 | Apache-2.0 | Permisiva | NanoDet, ZXing-C++, ONNX Runtime |
| BSD 2-Clause | BSD-2-Clause | Permisiva | Componentes varios |
| BSD 3-Clause | BSD-3-Clause | Permisiva | PyTorch |
| ISC | ISC | Permisiva | Dependencias npm |

## Licencias prohibidas (blacklist)

| Licencia | SPDX | Motivo |
|----------|------|--------|
| AGPL-3.0 | AGPL-3.0 | Obliga a liberar código fuente incluso en SaaS |
| GPL-3.0 | GPL-3.0 | Obliga a liberar código fuente al distribuir |
| GPL-2.0 | GPL-2.0 | Igual que GPL-3.0 |
| LGPL-3.0 | LGPL-3.0 | Vinculación estática puede requerir liberación |
| SSPL | SSPL-1.0 | Similar a AGPL |
| BSL | BUSL-1.1 | Restricciones comerciales |

## Dependencia prohibida explícitamente

### Ultralytics YOLO — AGPL-3.0

- ❌ `ultralytics` (pip package) — AGPL-3.0
- ❌ `YOLOv5`, `YOLOv8`, `YOLOv9`, `YOLOv10`, `YOLOv11` — AGPL-3.0
- ❌ Cualquier modelo pre-entrenado descargado de Ultralytics HUB
- ❌ Cualquier checkpoint derivado de pesos Ultralytics

**Alternativa**: NanoDet (Apache 2.0) o implementación propia desde cero.

---

## Auditoría por componente

### Fase 1: Modelos de IA

| Componente | Dependencia | Licencia | Estado |
|------------|-------------|----------|--------|
| Detector | NanoDet (RangiLyu/nanodet) | Apache 2.0 | ✅ OK |
| Detector (alt) | Implementación propia YOLO-tiny | Propia (MIT) | ✅ OK |
| Super-resolución | ESRGAN (xinntao/ESRGAN) | Apache 2.0 | ✅ OK |
| Super-resolución | Implementación propia reducida | Propia (MIT) | ✅ OK |
| Deblur CNN | Implementación propia UNet | Propia (MIT) | ✅ OK |
| Perspectiva | Implementación propia MobileNetV3 | Propia (MIT) | ✅ OK |
| Autofocus | Implementación propia | Propia (MIT) | ✅ OK |
| Framework training | PyTorch | BSD-3 | ✅ OK |
| Export | onnx, onnxruntime, onnx-simplifier | MIT | ✅ OK |

### Fase 2: Núcleo Rust

| Componente | Dependencia | Licencia | Estado |
|------------|-------------|----------|--------|
| ONNX Runtime | ort (crate) | MIT | ✅ OK |
| ONNX Runtime | onnxruntime (bin) | MIT | ✅ OK |
| Imágenes | image (crate) | MIT | ✅ OK |
| Operaciones CV | opencv-rust | MIT | ✅ OK |
| Wasm | wasm-bindgen | MIT/Apache 2.0 | ✅ OK |
| Wasm | js-sys, web-sys | MIT/Apache 2.0 | ✅ OK |
| Serialización | serde, serde_json | MIT/Apache 2.0 | ✅ OK |
| Async | wasm-bindgen-futures | MIT/Apache 2.0 | ✅ OK |
| ZXing | zxing-cpp (compilado a Wasm) | Apache 2.0 | ✅ OK |

### Fase 3: Wrappers SDK

| Componente | Dependencia | Licencia | Estado |
|------------|-------------|----------|--------|
| JS SDK | TypeScript | Apache 2.0 | ✅ OK |
| JS bundler | rollup | MIT | ✅ OK |
| Flutter | Flutter SDK | BSD-3 | ✅ OK |
| React Native | React Native | MIT | ✅ OK |
| Capacitor | @capacitor/core | MIT | ✅ OK |

### Fase 4: Benchmarking

| Componente | Dependencia | Licencia | Estado |
|------------|-------------|----------|--------|
| QuaggaJS (comparación) | @ericblade/quagga2 | MIT | ✅ OK |
| Generación datos | python-barcode, qrcode, Pillow | MIT/BSD | ✅ OK |

---

## Verificación automatizada

```bash
# Verificar dependencias Rust
cd core && cargo license --json | jq '.[] | select(.license | test("GPL|AGPL|LGPL|SSPL|BSL"))'

# Verificar dependencias Python
cd training && pip-licenses --format=json | jq '.[] | select(.License | test("GPL|AGPL|LGPL"))'

# Verificar dependencias npm
cd sdk && npx license-checker --json | jq '.[] | select(.licenses | test("GPL|AGPL|LGPL"))'
```

---

## Certificación

Este SDK y todos sus componentes cumplen con los requisitos de licencias permisivas. Ningún componente requiere la liberación del código fuente del producto final que integre ScanAI SDK.

**Auditor**: ScanAI Team  
**Fecha**: 2026-07-04  
**Versión**: 1.0.0
