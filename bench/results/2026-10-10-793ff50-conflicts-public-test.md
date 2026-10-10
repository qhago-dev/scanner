# Benchmark — public / test

Fecha 2026-10-10 · commit `793ff50` · Bun 1.3.12 · CPU 12th Gen Intel(R) Core(TM) i9-12900H
Motivo de la ejecución sobre test: regla de conflictos 1D + barrido en rebanadas (prueba Android)

> **No representativo de cámaras reales** (dataset public). No sirve para los gates G2/G3/G5.

## Motores

| Motor | Versión | Configuración |
|---|---|---|
| qhago | 0.0.0 | strategy balanced, los 13 formatos, validateChecksums por defecto |
| qhago+ai | 0.0.0 | qhago balanced + detector detector.int8.onnx (fallback, umbral 0.4, máx. 5 regiones) |

## Global

| Motor | Muestras | Recall (muestra) | Recall (código) | Lecturas falsas | Tasa falsa | FP en negativas | p50 ms | p95 ms | p99 ms |
|---|---|---|---|---|---|---|---|---|---|
| qhago | 1840 | 76.5 % | 76.5 % | 7 | 0.5 % | — | 10.4 | 165.3 | 533.2 |
| qhago+ai | 1840 | 83.9 % | 83.9 % | 9 | 0.6 % | — | 12.2 | 313.6 | 560.9 |

## Recall por escenario

| Escenario | n | qhago | qhago+ai |
|---|---|---|---|
| defocus | 152 | 11.8 % | 32.9 % |
| normal | 1688 | 82.3 % | 88.4 % |

## Recall por formato (por código; — = el motor no soporta el formato)

| Formato | qhago | qhago+ai |
|---|---|---|
| ean_13 | 75.9 % | 83.5 % |
| ean_8 | 94.6 % | 96.4 % |

## Comparaciones pareadas (qhago − otro; IC 95 % bootstrap por objeto)

| vs | Δ recall | IC 95 % | Veredicto | Δ lecturas falsas (otro − qhago) | IC 95 % |
|---|---|---|---|---|---|
| qhago+ai | -7.4 pp | [-9.1 pp, -5.9 pp] | peor | +0.0 pp | [+0.0 pp, +0.0 pp] |

Por escenario (Δ recall, veredicto; gate solo con n ≥ 60):

| Escenario | qhago+ai |
|---|---|
| defocus | -21.1 pp (peor) |
| normal | -6.2 pp (peor) |
