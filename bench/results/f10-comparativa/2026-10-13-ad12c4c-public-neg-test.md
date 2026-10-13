# Benchmark — public-neg / test

Fecha 2026-10-13 · commit `ad12c4c` · Bun 1.3.12 · CPU 12th Gen Intel(R) Core(TM) i9-12900H
Motivo de la ejecución sobre test: Comparativa final con zxing-js y Quagga2 (sin cambios de código)

> **No representativo de cámaras reales** (dataset public-neg). No sirve para los gates G2/G3/G5.

## Motores

| Motor | Versión | Configuración |
|---|---|---|
| qhago | 0.0.0 | strategy balanced, los 13 formatos, validateChecksums por defecto |
| zxing-js | 0.21.3 | MultiFormatReader + HybridBinarizer, TRY_HARDER; lee 1 código por imagen |
| quagga2 | 1.12.1 | decodeSingle con locate:true, size 800, todos sus readers 1D; en Node solo acepta rutas (incluye su propio decode de la imagen) |

## Global

| Motor | Muestras | Recall (muestra) | Recall (código) | Lecturas falsas | Tasa falsa | FP en negativas (cota 95 %) | p50 ms | p95 ms | p99 ms |
|---|---|---|---|---|---|---|---|---|---|
| qhago | 58 | — | — | 0 | 0.0 % | 0.0 % (≤ 6.2 %) | 41.0 | 122.1 | 160.5 |
| zxing-js | 58 | — | — | 0 | 0.0 % | 0.0 % (≤ 6.2 %) | 54.7 | 90.8 | 107.5 |
| quagga2 | 58 | — | — | 1 | 100.0 % | 1.7 % (≤ 9.2 %) | 59.1 | 87.2 | 102.4 |

## Recall por escenario

| Escenario | n | qhago | zxing-js | quagga2 |
|---|---|---|---|---|
| negativa-recorte | 0 | — | — | — |

## Recall por formato (por código; — = el motor no soporta el formato)

| Formato | qhago | zxing-js | quagga2 |
|---|---|---|---|

## Comparaciones pareadas (qhago − otro; IC 95 % bootstrap por objeto)

| vs | Δ recall | IC 95 % | Veredicto | Objetos | MDE de esta comparación | Por objeto (+ / − / =, test de signos) | Δ lecturas falsas (otro − qhago) | IC 95 % |
|---|---|---|---|---|---|---|---|---|
| zxing-js | — | [—, —] | sin datos | 0 ⚠ | — | +0 / −0 / =0 (p 1.000) | +0.0 pp | [+0.0 pp, +0.0 pp] |
| quagga2 | — | [—, —] | sin datos | 0 ⚠ | — | +0 / −0 / =0 (p 1.000) | +1.7 pp | [+0.0 pp, +5.9 pp] |

⚠ = menos de 30 objetos: IC por objeto poco fiable (informativo; el gate sigue la regla n ≥ 60).

Por escenario (Δ recall, veredicto; objetos; por objeto +/−; gate solo con n ≥ 60):

| Escenario | zxing-js | quagga2 |
|---|---|---|
| negativa-recorte | — (sin gate (n<60); 0 obj ⚠; +0/−0) | — (sin gate (n<60); 0 obj ⚠; +0/−0) |
