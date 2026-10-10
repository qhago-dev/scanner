# Benchmark — synthetic / dev

Fecha 2026-10-10 · commit `a65c643` · Bun 1.3.12 · CPU 12th Gen Intel(R) Core(TM) i9-12900H

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
| qhago | 951 | 80.8 % | 82.9 % | 0 | 0.0 % | 0.0 % | 44.9 | 188.1 | 264.4 |
| zxing-wasm | 951 | 73.4 % | 76.6 % | 4 | 0.5 % | 0.0 % | 43.8 | 103.4 | 124.9 |
| zxing-js | 951 | 40.9 % | 41.4 % | 5 | 1.1 % | 0.0 % | 40.2 | 147.8 | 191.4 |
| quagga2 | 951 | 22.4 % | 22.9 % | 63 | 20.7 % | 0.0 % | 38.1 | 63.9 | 75.6 |

## Recall por escenario

| Escenario | n | qhago | zxing-wasm | zxing-js | quagga2 |
|---|---|---|---|---|---|
| curved | 66 | 84.8 % | 83.3 % | 50.0 % | 48.5 % |
| damaged | 70 | 87.1 % | 87.1 % | 54.3 % | 50.0 % |
| defocus | 76 | 57.9 % | 47.4 % | 35.5 % | 10.5 % |
| dense_2d | 63 | 77.8 % | 76.2 % | 30.2 % | 0.0 % |
| glare | 68 | 91.2 % | 89.7 % | 57.4 % | 38.2 % |
| inverted | 66 | 98.5 % | 27.3 % | 0.0 % | 0.0 % |
| low_light | 70 | 74.3 % | 74.3 % | 32.9 % | 21.4 % |
| motion_blur | 80 | 65.0 % | 62.5 % | 41.3 % | 15.0 % |
| multi | 74 | 50.0 % | 50.0 % | 0.0 % | 0.0 % |
| negative | 0 | — | — | — | — |
| normal | 72 | 95.8 % | 93.1 % | 62.5 % | 44.4 % |
| perspective | 67 | 80.6 % | 80.6 % | 53.7 % | 20.9 % |
| screen | 71 | 98.6 % | 93.0 % | 53.5 % | 43.7 % |
| small | 72 | 94.4 % | 93.1 % | 59.7 % | 0.0 % |

## Recall por formato (por código; — = el motor no soporta el formato)

| Formato | qhago | zxing-wasm | zxing-js | quagga2 |
|---|---|---|---|---|
| aztec | 98.8 % | 98.8 % | 17.9 % | — |
| codabar | 67.9 % | 60.5 % | 0.0 % | 33.3 % |
| code_128 | 71.1 % | 61.9 % | 44.3 % | 30.9 % |
| code_39 | 64.3 % | 57.1 % | 61.4 % | 24.3 % |
| code_93 | 74.0 % | 66.2 % | 50.6 % | 24.7 % |
| data_matrix | 90.6 % | 89.6 % | 11.5 % | — |
| ean_13 | 88.7 % | 80.3 % | 64.8 % | 43.7 % |
| ean_8 | 95.7 % | 84.3 % | 72.9 % | 62.9 % |
| itf | 92.4 % | 81.8 % | 37.9 % | 42.4 % |
| pdf417 | 54.2 % | 48.2 % | 53.0 % | — |
| qr_code | 94.0 % | 92.0 % | 61.0 % | — |
| upc_a | 87.8 % | 81.1 % | 66.7 % | 51.1 % |
| upc_e | 98.6 % | 90.4 % | 0.0 % | 0.0 % |

## Comparaciones pareadas (qhago − otro; IC 95 % bootstrap por objeto)

| vs | Δ recall | IC 95 % | Veredicto | Δ lecturas falsas (otro − qhago) | IC 95 % |
|---|---|---|---|---|---|
| zxing-wasm | +7.3 pp | [+5.7 pp, +9.1 pp] | mejor | +0.5 pp | [+0.1 pp, +1.1 pp] |
| zxing-js | +39.9 pp | [+36.5 pp, +43.1 pp] | mejor | +0.9 pp | [+0.2 pp, +1.7 pp] |
| quagga2 | +58.4 pp | [+55.0 pp, +61.5 pp] | mejor | +18.3 pp | [+14.1 pp, +22.5 pp] |

Por escenario (Δ recall, veredicto; gate solo con n ≥ 60):

| Escenario | zxing-wasm | zxing-js | quagga2 |
|---|---|---|---|
| curved | +1.5 pp (no peor) | +34.8 pp (mejor) | +36.4 pp (mejor) |
| damaged | +0.0 pp (no peor) | +32.9 pp (mejor) | +37.1 pp (mejor) |
| defocus | +10.5 pp (mejor) | +22.4 pp (mejor) | +47.4 pp (mejor) |
| dense_2d | +1.6 pp (no peor) | +47.6 pp (mejor) | +77.8 pp (mejor) |
| glare | +1.5 pp (no peor) | +33.8 pp (mejor) | +52.9 pp (mejor) |
| inverted | +71.2 pp (mejor) | +98.5 pp (mejor) | +98.5 pp (mejor) |
| low_light | +0.0 pp (no peor) | +41.4 pp (mejor) | +52.9 pp (mejor) |
| motion_blur | +2.5 pp (no peor) | +23.8 pp (mejor) | +50.0 pp (mejor) |
| multi | +0.0 pp (no peor) | +50.0 pp (mejor) | +50.0 pp (mejor) |
| negative | — (sin gate (n<60)) | — (sin gate (n<60)) | — (sin gate (n<60)) |
| normal | +2.8 pp (no peor) | +33.3 pp (mejor) | +51.4 pp (mejor) |
| perspective | +0.0 pp (no peor) | +26.9 pp (mejor) | +59.7 pp (mejor) |
| screen | +5.6 pp (mejor) | +45.1 pp (mejor) | +54.9 pp (mejor) |
| small | +1.4 pp (no peor) | +34.7 pp (mejor) | +94.4 pp (mejor) |
