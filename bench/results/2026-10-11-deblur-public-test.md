# Benchmark — public / test

Fecha 2026-10-11 · commit `5e25efc` · Bun 1.3.12 · CPU 12th Gen Intel(R) Core(TM) i9-12900H
Motivo de la ejecución sobre test: fase 9 M4: lector deblur-EAN en decode() (fallback + verificación cruzada)

> **No representativo de cámaras reales** (dataset public). No sirve para los gates G2/G3/G5.

## Motores

| Motor | Versión | Configuración |
|---|---|---|
| qhago | 0.0.0 | strategy balanced, los 13 formatos, validateChecksums por defecto |
| qhago+ai | 0.0.0 | qhago balanced + detector detector.int8.onnx (fallback, umbral 0.4, máx. 5 regiones) |

## Global

| Motor | Muestras | Recall (muestra) | Recall (código) | Lecturas falsas | Tasa falsa | FP en negativas | p50 ms | p95 ms | p99 ms |
|---|---|---|---|---|---|---|---|---|---|
| qhago | 1840 | 80.2 % | 80.2 % | 8 | 0.5 % | — | 16.9 | 366.6 | 681.8 |
| qhago+ai | 1840 | 85.9 % | 85.9 % | 9 | 0.6 % | — | 21.4 | 469.2 | 838.1 |

## Recall por escenario

| Escenario | n | qhago | qhago+ai |
|---|---|---|---|
| defocus | 152 | 53.9 % | 57.9 % |
| normal | 1688 | 82.5 % | 88.4 % |

## Recall por formato (por código; — = el motor no soporta el formato)

| Formato | qhago | qhago+ai |
|---|---|---|
| ean_13 | 79.7 % | 85.5 % |
| ean_8 | 94.6 % | 96.4 % |

## Comparaciones pareadas (qhago − otro; IC 95 % bootstrap por objeto)

| vs | Δ recall | IC 95 % | Veredicto | Δ lecturas falsas (otro − qhago) | IC 95 % |
|---|---|---|---|---|---|
| qhago+ai | -5.7 pp | [-6.8 pp, -4.6 pp] | peor | +0.0 pp | [+0.0 pp, +0.0 pp] |

Por escenario (Δ recall, veredicto; gate solo con n ≥ 60):

| Escenario | qhago+ai |
|---|---|
| defocus | -3.9 pp (peor) |
| normal | -5.9 pp (peor) |
