# Benchmark — public / test

Fecha 2026-10-13 · commit `ad12c4c` · Bun 1.3.12 · CPU 12th Gen Intel(R) Core(TM) i9-12900H
Motivo de la ejecución sobre test: Comparativa final con zxing-js y Quagga2 (sin cambios de código)

> **No representativo de cámaras reales** (dataset public). No sirve para los gates G2/G3/G5.

## Motores

| Motor | Versión | Configuración |
|---|---|---|
| qhago | 0.0.0 | strategy balanced, los 13 formatos, validateChecksums por defecto |
| zxing-js | 0.21.3 | MultiFormatReader + HybridBinarizer, TRY_HARDER; lee 1 código por imagen |
| quagga2 | 1.12.1 | decodeSingle con locate:true, size 800, todos sus readers 1D; en Node solo acepta rutas (incluye su propio decode de la imagen) |

## Global

| Motor | Muestras | Recall (muestra) | Recall (código) | Lecturas falsas | Tasa falsa | FP en negativas (cota 95 %) | p50 ms | p95 ms | p99 ms |
|---|---|---|---|---|---|---|---|---|---|
| qhago | 818 | 80.9 % | 80.9 % | 0 | 0.0 % | — | 17.1 | 421.3 | 698.2 |
| qhago (publicable) | 489 | 74.0 % | 74.0 % | 0 | 0.0 % | — | 31.5 | 488.8 | 821.2 |
| zxing-js | 818 | 58.4 % | 58.4 % | 8 | 1.6 % | — | 16.5 | 102.8 | 156.2 |
| zxing-js (publicable) | 489 | 47.0 % | 47.0 % | 6 | 2.5 % | — | 30.3 | 116.5 | 183.1 |
| quagga2 | 818 | 42.5 % | 42.5 % | 21 | 5.0 % | — | 33.8 | 74.0 | 103.8 |
| quagga2 (publicable) | 489 | 38.7 % | 38.7 % | 11 | 4.8 % | — | 36.6 | 91.3 | 109.4 |

## Recall por escenario

| Escenario | n | qhago | zxing-js | quagga2 |
|---|---|---|---|---|
| defocus | 69 | 59.4 % | 2.9 % | 0.0 % |
| normal | 749 | 82.9 % | 63.6 % | 46.5 % |

## Recall por formato (por código; — = el motor no soporta el formato)

| Formato | qhago | zxing-js | quagga2 |
|---|---|---|---|
| ean_13 | 80.4 % | 59.3 % | 42.3 % |
| ean_8 | 96.2 % | 30.8 % | 50.0 % |

## Comparaciones pareadas (qhago − otro; IC 95 % bootstrap por objeto)

| vs | Δ recall | IC 95 % | Veredicto | Objetos | MDE de esta comparación | Por objeto (+ / − / =, test de signos) | Δ lecturas falsas (otro − qhago) | IC 95 % |
|---|---|---|---|---|---|---|---|---|
| zxing-js | +22.5 pp | [+18.6 pp, +26.6 pp] | mejor | 663 | +5.7 pp | +155 / −8 / =500 (p < 0,001) | +1.1 pp | [+0.2 pp, +2.1 pp] |
| quagga2 | +38.4 pp | [+33.7 pp, +42.8 pp] | mejor | 663 | +6.3 pp | +279 / −14 / =370 (p < 0,001) | +4.7 pp | [+2.1 pp, +8.2 pp] |

⚠ = menos de 30 objetos: IC por objeto poco fiable (informativo; el gate sigue la regla n ≥ 60).

Por escenario (Δ recall, veredicto; objetos; por objeto +/−; gate solo con n ≥ 60):

| Escenario | zxing-js | quagga2 |
|---|---|---|
| defocus | +56.5 pp (mejor; 11 obj ⚠; +7/−0) | +59.4 pp (mejor; 11 obj ⚠; +7/−0) |
| normal | +19.4 pp (mejor; 657 obj; +149/−8) | +36.4 pp (mejor; 657 obj; +274/−14) |
