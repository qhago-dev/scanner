# Benchmark — public / test

Fecha 2026-10-10 · commit `fba9312` · Bun 1.3.12 · CPU 12th Gen Intel(R) Core(TM) i9-12900H
Motivo de la ejecución sobre test: Primer benchmark con fotos reales públicas (ArTe-Lab, KAIST, Muenster); G1/G2/G5 orientativos

> **No representativo de cámaras reales** (dataset public). No sirve para los gates G2/G3/G5.

## Motores

| Motor | Versión | Configuración |
|---|---|---|
| qhago | 0.0.0 | strategy balanced, los 13 formatos, validateChecksums por defecto |
| qhago+ai | 0.0.0 | qhago balanced + detector detector.int8.onnx (fallback, umbral 0.4, máx. 5 regiones) |
| zxing-wasm | 3.1.5 | readBarcodes con tryHarder y textMode Plain (igual que qhago), todos los formatos; se filtran a los 13 de 1.0 |
| zxing-js | 0.21.3 | MultiFormatReader + HybridBinarizer, TRY_HARDER; lee 1 código por imagen |
| quagga2 | 1.12.1 | decodeSingle con locate:true, size 800, todos sus readers 1D; en Node solo acepta rutas (incluye su propio decode de la imagen) |

## Global

| Motor | Muestras | Recall (muestra) | Recall (código) | Lecturas falsas | Tasa falsa | FP en negativas | p50 ms | p95 ms | p99 ms |
|---|---|---|---|---|---|---|---|---|---|
| qhago | 1840 | 76.9 % | 76.9 % | 18 | 1.2 % | — | 11.5 | 204.9 | 491.7 |
| qhago+ai | 1840 | 83.9 % | 83.9 % | 19 | 1.2 % | — | 13.7 | 354.0 | 561.3 |
| zxing-wasm | 1840 | 71.4 % | 71.4 % | 22 | 1.6 % | — | 15.2 | 142.1 | 231.2 |
| zxing-js | 1840 | 57.6 % | 57.6 % | 11 | 1.0 % | — | 21.1 | 102.5 | 172.9 |
| quagga2 | 1840 | 42.9 % | 42.9 % | 38 | 4.1 % | — | 34.2 | 88.3 | 147.2 |

## Recall por escenario

| Escenario | n | qhago | qhago+ai | zxing-wasm | zxing-js | quagga2 |
|---|---|---|---|---|---|---|
| defocus | 152 | 11.8 % | 32.9 % | 5.3 % | 2.0 % | 0.0 % |
| normal | 1688 | 82.8 % | 88.4 % | 77.3 % | 62.6 % | 46.7 % |

## Recall por formato (por código; — = el motor no soporta el formato)

| Formato | qhago | qhago+ai | zxing-wasm | zxing-js | quagga2 |
|---|---|---|---|---|---|
| ean_13 | 76.3 % | 83.5 % | 70.7 % | 58.2 % | 42.8 % |
| ean_8 | 94.6 % | 96.4 % | 91.1 % | 37.5 % | 44.6 % |

## Comparaciones pareadas (qhago − otro; IC 95 % bootstrap por objeto)

| vs | Δ recall | IC 95 % | Veredicto | Δ lecturas falsas (otro − qhago) | IC 95 % |
|---|---|---|---|---|---|
| qhago+ai | -7.0 pp | [-8.6 pp, -5.5 pp] | peor | +0.0 pp | [+0.0 pp, +0.0 pp] |
| zxing-wasm | +5.5 pp | [+4.4 pp, +6.7 pp] | mejor | +0.6 pp | [-0.1 pp, +1.3 pp] |
| zxing-js | +19.3 pp | [+17.2 pp, +21.6 pp] | mejor | -0.2 pp | [-0.9 pp, +0.5 pp] |
| quagga2 | +34.0 pp | [+31.0 pp, +37.2 pp] | mejor | +2.2 pp | [+0.9 pp, +3.6 pp] |

Por escenario (Δ recall, veredicto; gate solo con n ≥ 60):

| Escenario | qhago+ai | zxing-wasm | zxing-js | quagga2 |
|---|---|---|---|---|
| defocus | -21.1 pp (peor) | +6.6 pp (mejor) | +9.9 pp (mejor) | +11.8 pp (mejor) |
| normal | -5.7 pp (peor) | +5.5 pp (mejor) | +20.2 pp (mejor) | +36.0 pp (mejor) |
