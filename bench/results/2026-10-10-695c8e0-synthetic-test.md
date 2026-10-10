# Benchmark — synthetic / test

Fecha 2026-10-10 · commit `695c8e0` · Bun 1.3.12 · CPU 12th Gen Intel(R) Core(TM) i9-12900H
Motivo de la ejecución sobre test: G5 (sintético): detector-v1 int8

> **No representativo de cámaras reales** (dataset synthetic). No sirve para los gates G2/G3/G5.

## Motores

| Motor | Versión | Configuración |
|---|---|---|
| qhago | 0.0.0 | strategy balanced, los 13 formatos, validateChecksums por defecto |
| qhago+ai | 0.0.0 | qhago balanced + detector detector.int8.onnx (fallback, umbral 0.4, máx. 5 regiones) |

## Global

| Motor | Muestras | Recall (muestra) | Recall (código) | Lecturas falsas | Tasa falsa | FP en negativas | p50 ms | p95 ms | p99 ms |
|---|---|---|---|---|---|---|---|---|---|
| qhago | 399 | 81.0 % | 82.1 % | 1 | 0.3 % | 0.0 % | 60.6 | 268.0 | 399.5 |
| qhago+ai | 399 | 85.5 % | 86.0 % | 1 | 0.3 % | 0.0 % | 66.5 | 385.8 | 629.2 |

## Recall por escenario

| Escenario | n | qhago | qhago+ai |
|---|---|---|---|
| curved | 34 | 85.3 % | 91.2 % |
| damaged | 30 | 76.7 % | 86.7 % |
| defocus | 24 | 45.8 % | 45.8 % |
| dense_2d | 37 | 75.7 % | 83.8 % |
| glare | 32 | 100.0 % | 100.0 % |
| inverted | 34 | 94.1 % | 94.1 % |
| low_light | 30 | 70.0 % | 90.0 % |
| motion_blur | 20 | 75.0 % | 75.0 % |
| multi | 26 | 50.0 % | 50.0 % |
| negative | 0 | — | — |
| normal | 28 | 92.9 % | 96.4 % |
| perspective | 33 | 87.9 % | 93.9 % |
| screen | 29 | 100.0 % | 100.0 % |
| small | 28 | 85.7 % | 85.7 % |

## Recall por formato (por código; — = el motor no soporta el formato)

| Formato | qhago | qhago+ai |
|---|---|---|
| aztec | 97.2 % | 97.2 % |
| codabar | 62.2 % | 70.3 % |
| code_128 | 67.9 % | 67.9 % |
| code_39 | 70.6 % | 76.5 % |
| code_93 | 83.3 % | 86.1 % |
| data_matrix | 89.2 % | 91.9 % |
| ean_13 | 89.7 % | 93.1 % |
| ean_8 | 100.0 % | 100.0 % |
| itf | 91.7 % | 91.7 % |
| pdf417 | 37.5 % | 60.0 % |
| qr_code | 94.1 % | 94.1 % |
| upc_a | 100.0 % | 100.0 % |
| upc_e | 97.0 % | 97.0 % |

## Comparaciones pareadas (qhago − otro; IC 95 % bootstrap por objeto)

| vs | Δ recall | IC 95 % | Veredicto | Δ lecturas falsas (otro − qhago) | IC 95 % |
|---|---|---|---|---|---|
| qhago+ai | -4.4 pp | [-6.5 pp, -2.6 pp] | peor | +0.0 pp | [+0.0 pp, +0.0 pp] |

Por escenario (Δ recall, veredicto; gate solo con n ≥ 60):

| Escenario | qhago+ai |
|---|---|
| curved | -5.9 pp (sin gate (n<60)) |
| damaged | -10.0 pp (sin gate (n<60)) |
| defocus | +0.0 pp (sin gate (n<60)) |
| dense_2d | -8.1 pp (sin gate (n<60)) |
| glare | +0.0 pp (sin gate (n<60)) |
| inverted | +0.0 pp (sin gate (n<60)) |
| low_light | -20.0 pp (sin gate (n<60)) |
| motion_blur | +0.0 pp (sin gate (n<60)) |
| multi | +0.0 pp (sin gate (n<60)) |
| negative | — (sin gate (n<60)) |
| normal | -3.6 pp (sin gate (n<60)) |
| perspective | -6.1 pp (sin gate (n<60)) |
| screen | +0.0 pp (sin gate (n<60)) |
| small | +0.0 pp (sin gate (n<60)) |
