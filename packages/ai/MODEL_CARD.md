# Model card — detector-v1 (`@qhago/ai`)

> **Estado: experimental.** No supera el gate G5 (ver "Evaluación"). No usar como sustituto del motor clásico:
> solo como ayuda cuando este no lee.

## Uso previsto

Localizar códigos de barras y 2D (y sus 4 esquinas) en frames de cámara o imágenes donde ZXing no encuentra el
símbolo: poca luz, perspectiva fuerte, superficies curvas, códigos dañados. El motor rectifica cada región en la
resolución original (`sa_read_quad`) y decodifica con ZXing; **el modelo no decodifica nada** y no puede producir
lecturas por sí mismo, por eso no aumenta las lecturas falsas por diseño.

Fuera de alcance: OCR, decodificación, códigos fuera de los 13 formatos de 1.0, vigilancia o identificación de
personas.

## Modelo

| | |
|---|---|
| Arquitectura | CenterNet-lite propio (MIT): backbone depthwise + FPN a stride 4, cabezas heatmap (5 clases), offset y 4 esquinas |
| Clases | `1d`, `qr`, `datamatrix`, `pdf417`, `aztec` |
| Entrada | 1×1×320×320, luminancia en [0, 1], letterbox (relleno 114/255) |
| Salidas | `heat` [1,5,80,80] (sigmoid), `offset` [1,2,80,80], `corners` [1,8,80,80] (×32 px); picos y NMS en TS |
| Parámetros / cómputo | 0,386 M / 1,30 GMAC |
| Pesos iniciales | ninguno (entrenado desde cero: sin pesos de ImageNet ni sus licencias) |
| Export | ONNX opset 17. `detector.int8.onnx` (QDQ estático, 498 KB; las convs finales de las cabezas y el Sigmoid en FP32), `detector.fp16.onnx` (786 KB, WebGPU) |

Desviación del diseño (ADR-04 "o equivalente"): se usó CenterNet-lite en lugar de NanoDet-Plus porque predice
esquinas directamente, exporta solo Conv/BN/ReLU/Upsample (compatible con WebGPU y WASM sin ops raros) y es pequeño.

## Datos

| Fuente | Uso | Licencia |
|---|---|---|
| Sintético `training/data/synth_det.py`, 100 000 imágenes (semilla 1234): símbolos reales de los 13 formatos (writer de zxing-cpp, Apache-2.0) con perspectiva, rotación, curvatura cilíndrica, blur de movimiento/desenfoque, glare, poca luz, ruido, JPEG q40-92, inversión y distractores (texto, rayas, rejillas) sobre fondos procedurales | entrenamiento (98 %) y validación (2 %) | generado (propio) |
| Fondos fotográficos CC0/CC-BY | **no usados** en v1 | — |
| Capturas reales (F1, split `dev-train`) | **no usadas**: el dataset real aún no existe | — |

Ninguna imagen de terceros ni datos personales (ADR-12).

## Entrenamiento

PyTorch 2.12, 1× RTX 3060 Laptop (6 GB), 30 épocas, batch 128, AdamW (lr 3e-3, wd 1e-4), warmup 500 pasos + coseno,
AMP, focal loss (heatmap) + L1 (offset, esquinas), flip horizontal y brillo/contraste. **1,77 h** de GPU local
(sin coste de nube). Mejor época: 20 (por mAP@0.5 de validación). Config: `training/runs/detector-v1/config.json`
(fuera de git).

## Evaluación

### Detector (validación sintética, nunca vista en entrenamiento)

| Variante | mAP@0.5 | Error de esquinas (÷ lado) | CPU ORT p50 (x86, multihilo) |
|---|---|---|---|
| FP32 | 0,979 | 3,6 % | 13,0 ms |
| FP16 | 0,963 | 3,6 % | 13,0 ms |
| INT8 | 0,976 | 3,9 % | 7,6 ms |

AP por clase (INT8): 1D 0,988 · QR 0,975 · DataMatrix 0,943 · PDF417 0,984 · Aztec 0,992 (1 000 imágenes).
Paridad ONNX FP32 vs PyTorch: |Δ| máx. 4,9e-5. Pre/postproceso TS ≡ Python (`test/unit/golden.test.ts`).

### Integración (bench, dataset sintético, split `test`, 399 muestras)

| Motor | Recall (muestra) | Lecturas falsas | p95 |
|---|---|---|---|
| qhago (balanced) | 81,0 % | 1 (0,3 %) | 268 ms |
| qhago + detector (fallback) | **85,5 %** | 1 (0,3 %) | 386 ms |

Δ = +4,4 pp (IC 95 % bootstrap por objeto [+2,6; +6,5]): "mejor". Mayores ganancias: poca luz +20 pp, dañados
+10 pp, 2D densos +8 pp, perspectiva +6 pp, curvos +6 pp. Sin ganancia en desenfoque, movimiento, multi-código ni
códigos pequeños. Informe: `bench/results/2026-10-10-695c8e0-synthetic-test.md`.

### Latencia del detector en navegador

Chrome 156 escritorio (i9-12900H, otras cargas en paralelo), ORT Web WASM 1 hilo, 1280×720 → detecciones:
**77 ms p50** (letterbox 5 ms). En móviles será varias veces más. Por eso, en vídeo, el plugin corre como mucho
cada `intervalMs` (300 ms por defecto) y solo en modo `fallback`.

### Gate G5

| Criterio | Resultado | |
|---|---|---|
| mAP@0.5 ≥ 0,85 en `dev-val` | 0,967 (validación **sintética**) | ✔ con datos sintéticos; falta `dev-val` real |
| Error de esquinas ≤ 3 % | 3,6 % (INT8 3,9 %) | ✘ |
| Subconjunto adverso de `test` +10 pp y "mejor" | +4,6 pp (78,1 % → 82,8 %), sintético | ✘ |
| false_read_rate igual o menor | igual | ✔ |
| Latencia p95 ≤ 60 ms WASM / 25 ms WebGPU en `android-mid` | 77 ms p50 en escritorio | ✘ (sin medir en el dispositivo) |
| Sin `@qhago/ai`, no se descarga ORT ni modelos | `@qhago/scanner` no tiene dependencias | ✔ |

**Decisión (2026-10-10): no publicar.** El paquete queda en el repo como experimental con `"private": true` (quitarlo cuando pase G5). Para
reconsiderarlo: (1) dataset real de F1 con `dev-train`/`dev-val`, (2) modelo con cabezas más ligeras
(variante `--head shared`, 0,24 GMAC, en entrenamiento) para cumplir la latencia, (3) fondos fotográficos CC0.

## Limitaciones y riesgos

- Entrenado solo con sintético: el rendimiento en fotos reales es desconocido.
- Coste: runtime de ONNX Runtime Web ~3,7 MB gzip (WASM) o ~6,7 MB (WebGPU) además del modelo.
- La clase predicha solo ordena los formatos a probar; si se equivoca, se reintenta con todos los configurados.
- Sesgo de dominio: fondos procedurales; puede proponer regiones en texturas regulares (rejillas, texto) — no
  produce lecturas falsas, pero cuesta tiempo de decodificación.
