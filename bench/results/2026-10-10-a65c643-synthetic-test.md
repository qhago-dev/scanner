# Benchmark — synthetic / test

Fecha 2026-10-10 · commit `a65c643` · Bun 1.3.12 · CPU 12th Gen Intel(R) Core(TM) i9-12900H
Motivo de la ejecución sobre test: Baseline F1.9 sobre dataset sintético (no real)

> **No representativo de cámaras reales** (dataset synthetic). No sirve para los gates G2/G3/G5.

## Motores

| Motor | Versión | Configuración |
|---|---|---|
| qhago | 0.0.0 | strategy balanced, los 13 formatos, validateChecksums por defecto |
| zxing-wasm | 3.1.5 | readBarcodes con tryHarder y textMode Plain (igual que qhago), todos los formatos; se filtran a los 13 de 1.0 |
| zxing-js | 0.21.3 | MultiFormatReader + HybridBinarizer, TRY_HARDER; lee 1 código por imagen |
| quagga2 | 1.12.1 | decodeSingle con locate:true, size 800, todos sus readers 1D; en Node solo acepta rutas (incluye su propio decode de la imagen) |

## Global

| Motor | Muestras | Recall (muestra) | Recall (código) | Lecturas falsas | Tasa falsa | FP en negativas | p50 ms | p95 ms | p99 ms |
|---|---|---|---|---|---|---|---|---|---|
| qhago | 399 | 81.0 % | 82.1 % | 1 | 0.3 % | 0.0 % | 46.5 | 194.0 | 267.5 |
| zxing-wasm | 399 | 73.0 % | 75.0 % | 2 | 0.6 % | 0.0 % | 47.9 | 97.3 | 121.1 |
| zxing-js | 399 | 41.3 % | 41.5 % | 2 | 1.1 % | 0.0 % | 44.4 | 146.1 | 201.9 |
| quagga2 | 399 | 22.6 % | 22.2 % | 23 | 19.2 % | 0.0 % | 37.2 | 64.3 | 77.6 |

## Recall por escenario

| Escenario | n | qhago | zxing-wasm | zxing-js | quagga2 |
|---|---|---|---|---|---|
| curved | 34 | 85.3 % | 85.3 % | 41.2 % | 26.5 % |
| damaged | 30 | 76.7 % | 76.7 % | 46.7 % | 40.0 % |
| defocus | 24 | 45.8 % | 37.5 % | 20.8 % | 16.7 % |
| dense_2d | 37 | 75.7 % | 75.7 % | 29.7 % | 0.0 % |
| glare | 32 | 100.0 % | 96.9 % | 75.0 % | 53.1 % |
| inverted | 34 | 94.1 % | 17.6 % | 0.0 % | 0.0 % |
| low_light | 30 | 70.0 % | 70.0 % | 43.3 % | 33.3 % |
| motion_blur | 20 | 75.0 % | 70.0 % | 35.0 % | 5.0 % |
| multi | 26 | 50.0 % | 50.0 % | 0.0 % | 0.0 % |
| negative | 0 | — | — | — | — |
| normal | 28 | 92.9 % | 89.3 % | 75.0 % | 53.6 % |
| perspective | 33 | 87.9 % | 87.9 % | 60.6 % | 18.2 % |
| screen | 29 | 100.0 % | 100.0 % | 51.7 % | 44.8 % |
| small | 28 | 85.7 % | 85.7 % | 53.6 % | 0.0 % |

## Recall por formato (por código; — = el motor no soporta el formato)

| Formato | qhago | zxing-wasm | zxing-js | quagga2 |
|---|---|---|---|---|
| aztec | 97.2 % | 97.2 % | 11.1 % | — |
| codabar | 62.2 % | 59.5 % | 0.0 % | 27.0 % |
| code_128 | 67.9 % | 57.1 % | 42.9 % | 25.0 % |
| code_39 | 70.6 % | 52.9 % | 50.0 % | 29.4 % |
| code_93 | 83.3 % | 69.4 % | 58.3 % | 30.6 % |
| data_matrix | 89.2 % | 89.2 % | 13.5 % | — |
| ean_13 | 89.7 % | 79.3 % | 72.4 % | 37.9 % |
| ean_8 | 100.0 % | 88.9 % | 81.5 % | 59.3 % |
| itf | 91.7 % | 80.6 % | 55.6 % | 50.0 % |
| pdf417 | 37.5 % | 30.0 % | 47.5 % | — |
| qr_code | 94.1 % | 94.1 % | 52.9 % | — |
| upc_a | 100.0 % | 96.6 % | 75.9 % | 48.3 % |
| upc_e | 97.0 % | 90.9 % | 0.0 % | 0.0 % |

## Comparaciones pareadas (qhago − otro; IC 95 % bootstrap por objeto)

| vs | Δ recall | IC 95 % | Veredicto | Δ lecturas falsas (otro − qhago) | IC 95 % |
|---|---|---|---|---|---|
| zxing-wasm | +8.1 pp | [+5.5 pp, +10.9 pp] | mejor | +0.6 pp | [+0.0 pp, +1.6 pp] |
| zxing-js | +39.7 pp | [+34.5 pp, +44.9 pp] | mejor | +1.1 pp | [+0.0 pp, +2.7 pp] |
| quagga2 | +58.4 pp | [+53.5 pp, +63.4 pp] | mejor | +17.3 pp | [+11.3 pp, +23.3 pp] |

Por escenario (Δ recall, veredicto; gate solo con n ≥ 60):

| Escenario | zxing-wasm | zxing-js | quagga2 |
|---|---|---|---|
| curved | +0.0 pp (sin gate (n<60)) | +44.1 pp (sin gate (n<60)) | +58.8 pp (sin gate (n<60)) |
| damaged | +0.0 pp (sin gate (n<60)) | +30.0 pp (sin gate (n<60)) | +36.7 pp (sin gate (n<60)) |
| defocus | +8.3 pp (sin gate (n<60)) | +25.0 pp (sin gate (n<60)) | +29.2 pp (sin gate (n<60)) |
| dense_2d | +0.0 pp (sin gate (n<60)) | +45.9 pp (sin gate (n<60)) | +75.7 pp (sin gate (n<60)) |
| glare | +3.1 pp (sin gate (n<60)) | +25.0 pp (sin gate (n<60)) | +46.9 pp (sin gate (n<60)) |
| inverted | +76.5 pp (sin gate (n<60)) | +94.1 pp (sin gate (n<60)) | +94.1 pp (sin gate (n<60)) |
| low_light | +0.0 pp (sin gate (n<60)) | +26.7 pp (sin gate (n<60)) | +36.7 pp (sin gate (n<60)) |
| motion_blur | +5.0 pp (sin gate (n<60)) | +40.0 pp (sin gate (n<60)) | +70.0 pp (sin gate (n<60)) |
| multi | +0.0 pp (sin gate (n<60)) | +50.0 pp (sin gate (n<60)) | +50.0 pp (sin gate (n<60)) |
| negative | — (sin gate (n<60)) | — (sin gate (n<60)) | — (sin gate (n<60)) |
| normal | +3.6 pp (sin gate (n<60)) | +17.9 pp (sin gate (n<60)) | +39.3 pp (sin gate (n<60)) |
| perspective | +0.0 pp (sin gate (n<60)) | +27.3 pp (sin gate (n<60)) | +69.7 pp (sin gate (n<60)) |
| screen | +0.0 pp (sin gate (n<60)) | +48.3 pp (sin gate (n<60)) | +55.2 pp (sin gate (n<60)) |
| small | +0.0 pp (sin gate (n<60)) | +32.1 pp (sin gate (n<60)) | +85.7 pp (sin gate (n<60)) |
