# Baseline (F1.9) — 2026-10-10

Generado con el árbol de trabajo que se commiteó como **F1** (los archivos llevan el hash previo `a65c643`).
Entorno: `dev-local` (i9-12900H, Bun 1.3.12). **Ninguno de estos datasets es real**: no cuentan para G2/G3/G5.

| Dataset / split | Muestras | qhago | zxing-wasm | zxing-js | Quagga2 |
|---|---|---|---|---|---|
| zxing (regresión) / dev | 623 | **91,5 %** | 87,5 % | 59,1 % | 13,7 % |
| sintético / dev | 951 | **80,8 %** | 73,4 % | 40,9 % | 22,4 % |
| sintético / test | 399 | **81,0 %** | 73,0 % | 41,3 % | 22,6 % |

Recall por muestra. Comparación pareada qhago − otro (IC 95 %, bootstrap por objeto), sintético/test:
zxing-wasm **+8,1 pp [+5,5, +10,9] → mejor**; zxing-js +39,7 pp → mejor; Quagga2 +58,4 pp → mejor.

Lecturas falsas (sintético/test): qhago 0,3 %, zxing-wasm 0,6 %, zxing-js 1,1 %, Quagga2 19,2 %.

Latencia (sintético, Bun, imágenes 960–1280 px): p50 qhago 46,5 ms ≈ zxing-wasm 47,9 ms; p95 qhago 194 ms
vs 97 ms (más pasadas en imágenes que fallan; acotable con `timeBudgetMs`). Quagga2 incluye su propio decode de imagen.

Hallazgos que el benchmark obligó a corregir (ver F2 tareas): multi-código (cascada paraba demasiado pronto),
invertidos (pasada propia), normalización UPC-A.

Detalle: `2026-10-10-a65c643-*.md`. Umbrales de G2/G3/G5: se fijan con el dataset **real** (pendiente de captura).
