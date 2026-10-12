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

## Fotos reales públicas (2026-10-10, `dataset/public`, split test, 1 840 imágenes EAN-13/EAN-8)

| Motor | Recall | Lecturas falsas |
|---|---|---|
| qhago | 76,6 % | 0,5 % |
| qhago + detector IA | 83,9 % | 0,6 % |
| zxing-wasm | 71,4 % | 1,6 % |
| zxing-js | 57,6 % | 1,0 % |
| Quagga2 | 42,9 % | 4,1 % |

qhago − zxing-wasm = +5,5 pp (IC 95 % [4,4; 6,7]), "mejor". Informe: `2026-10-10-fba9312-public-test.md`.
Con la regla de conflictos 1D (`src/conflicts.ts`): qhago 76,9 → 76,5 % y lecturas falsas 18 → 7; con IA 83,9 %
igual y 19 → 9. Informe: `2026-10-10-793ff50-conflicts-public-test.md`.
Con la verificación de EAN/UPC hallados solo con "harder" (2 vistas): recall 76,6 %, falsas 7, p95 165 → 327 ms
(corrige 3 lecturas falsas reales de Android y `upca-2/48` de zxing-cpp). Informe: `2026-10-10-23fdf80-verify-public-test.md`.

## Nota F10.1 (2026-10-12): cambio de splits de `public`

Las cifras de `public` de arriba usan el split anterior (dev 765 / test 1840). Desde F10.1 hay dev / test / holdout
(1288 / 818 / 499) y no son comparables fila a fila. La línea base nueva se mide en F10.L sobre el dev nuevo.

Línea base nueva (F10.L, dev): [`2026-10-12-f10-baseline.md`](./2026-10-12-f10-baseline.md).
Cierre F10 (test, control de regresión): [`2026-10-12-f10-cierre.md`](./2026-10-12-f10-cierre.md).
