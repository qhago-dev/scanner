# Benchmark — public-blur / test

Fecha 2026-10-12 · commit `21bfc9d` · Bun 1.3.12 · CPU 12th Gen Intel(R) Core(TM) i9-12900H
Motivo de la ejecución sobre test: Cierre F10 (control de regresión semi-ciego)

> **No representativo de cámaras reales** (dataset public-blur). No sirve para los gates G2/G3/G5.

## Motores

| Motor | Versión | Configuración |
|---|---|---|
| qhago | 0.0.0 | strategy balanced, los 13 formatos, validateChecksums por defecto |
| qhago+ai | 0.0.0 | qhago balanced + detector detector.int8.onnx (fallback, umbral 0.4, máx. 5 regiones) |
| zxing-wasm | 3.1.5 | readBarcodes con tryHarder y textMode Plain (igual que qhago), todos los formatos; se filtran a los 13 de 1.0 |

## Global

| Motor | Muestras | Recall (muestra) | Recall (código) | Lecturas falsas | Tasa falsa | FP en negativas (cota 95 %) | p50 ms | p95 ms | p99 ms |
|---|---|---|---|---|---|---|---|---|---|
| qhago | 2885 | 15.6 % | 15.6 % | 2 | 0.4 % | — | 39.0 | 491.0 | 840.6 |
| qhago (publicable) | 1485 | 14.2 % | 14.2 % | 0 | 0.0 % | — | 49.8 | 683.8 | 1123.9 |
| qhago+ai | 2885 | 18.8 % | 18.8 % | 5 | 0.9 % | — | 168.4 | 791.5 | 1351.0 |
| qhago+ai (publicable) | 1485 | 17.2 % | 17.2 % | 0 | 0.0 % | — | 182.6 | 1037.8 | 1528.4 |
| zxing-wasm | 2885 | 8.4 % | 8.4 % | 4 | 1.6 % | — | 13.4 | 105.6 | 189.3 |
| zxing-wasm (publicable) | 1485 | 8.1 % | 8.1 % | 3 | 2.4 % | — | 17.9 | 170.3 | 223.9 |

## Recall por escenario

| Escenario | n | qhago | qhago+ai | zxing-wasm |
|---|---|---|---|---|
| blur-0.6 | 577 | 40.9 % | 52.9 % | 8.5 % |
| blur-0.9 | 577 | 0.0 % | 0.0 % | 0.0 % |
| blur-1.2 | 577 | 0.0 % | 0.0 % | 0.0 % |
| disk-0.9 | 577 | 0.0 % | 0.0 % | 0.0 % |
| motion-0.9 | 577 | 37.3 % | 40.9 % | 33.3 % |

## Recall por formato (por código; — = el motor no soporta el formato)

| Formato | qhago | qhago+ai | zxing-wasm |
|---|---|---|---|
| ean_13 | 15.6 % | 18.8 % | 8.1 % |
| ean_8 | 15.7 % | 16.5 % | 14.8 % |

## Comparaciones pareadas (qhago − otro; IC 95 % bootstrap por objeto)

| vs | Δ recall | IC 95 % | Veredicto | Objetos | MDE de esta comparación | Por objeto (+ / − / =, test de signos) | Δ lecturas falsas (otro − qhago) | IC 95 % |
|---|---|---|---|---|---|---|---|---|
| qhago+ai | -3.1 pp | [-4.1 pp, -2.3 pp] | peor | 503 | +1.4 pp | +0 / −70 / =433 (p < 0,001) | +0.0 pp | [+0.0 pp, +0.0 pp] |
| zxing-wasm | +7.3 pp | [+6.4 pp, +8.2 pp] | mejor | 503 | +1.3 pp | +183 / −3 / =317 (p < 0,001) | +1.3 pp | [-0.4 pp, +3.2 pp] |

⚠ = menos de 30 objetos: IC por objeto poco fiable (informativo; el gate sigue la regla n ≥ 60).

Por escenario (Δ recall, veredicto; objetos; por objeto +/−; gate solo con n ≥ 60):

| Escenario | qhago+ai | zxing-wasm |
|---|---|---|
| blur-0.6 | -12.0 pp (peor; 503 obj; +0/−54) | +32.4 pp (mejor; 503 obj; +172/−2) |
| blur-0.9 | +0.0 pp (no peor; 503 obj; +0/−0) | +0.0 pp (no peor; 503 obj; +0/−0) |
| blur-1.2 | +0.0 pp (no peor; 503 obj; +0/−0) | +0.0 pp (no peor; 503 obj; +0/−0) |
| disk-0.9 | +0.0 pp (no peor; 503 obj; +0/−0) | +0.0 pp (no peor; 503 obj; +0/−0) |
| motion-0.9 | -3.6 pp (peor; 503 obj; +0/−19) | +4.0 pp (mejor; 503 obj; +21/−1) |
