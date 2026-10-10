# Benchmark de vídeo — synthetic-video / dev

Tiempo real simulado: frames a su FPS, descartados si el motor está ocupado. ttfr = desde `firstVisibleMs` hasta la primera lectura correcta emitida.

> **No representativo de cámaras reales**: no sirve para G3.

| Motor | Vídeos | % leídos | ttfr p50 ms | ttfr p95 ms | Lecturas falsas | FP en negativas | Frames procesados | Descartados |
|---|---|---|---|---|---|---|---|---|
| qhago | 58 | 81.1 % | 935 | 2269 | 0 | 0/5 | 2523 | 957 |
| zxing-wasm | 58 | 75.5 % | 1149 | 2216 | 0 | 0/5 | 3480 | 0 |

| vs | Δ % leídos (qhago − otro) | IC 95 % | Veredicto |
|---|---|---|---|
| zxing-wasm | 5.7 pp | [0.0, 13.2] | no peor |
