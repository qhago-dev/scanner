# Fuentes de datos del benchmark (F1.1)

Cada fuente se registra con su licencia **antes** de usarla. Las no comerciales (`research-only`) solo
sirven para evaluar; nunca para entrenar modelos publicados (ADR-09). Privacidad: ADR-12.

| Fuente | Tipo | Licencia | Uso permitido | Estado |
|---|---|---|---|---|
| Capturas propias (`apps/demo/collect.html`) | real | own | evaluación + entrenamiento | pendiente de captura |
| `zxing-cpp/test/samples` | regresión (no cámara real) | Apache-2.0 | regresión, no gates | en uso (`dataset/zxing`) |
| Generador sintético (`dataset/synthetic/generate.py`) | sintético | own | complemento, separado en reportes | en uso |
| [ArTe-Lab Medium 1D](https://artelab.dista.uninsubria.it/downloads.html) (Zamberletti et al. 2010), 430 fotos EAN-13 con/sin autofoco | real | CC-BY-3.0 | evaluación + entrenamiento | en uso (`dataset/public`) |
| [KAIST barcode dataset](https://zenodo.org/records/13586402) (Quick Browser, IJCNN 2021), EAN-13 + EAN-8 | real | CC-BY-4.0 | evaluación + entrenamiento | en uso (`dataset/public`) |
| [Muenster BarcodeDB](https://www.uni-muenster.de/PRIA/en/forschung/index.shtml) (Wachenfeld et al. 2008), copia incluida en KAIST | real | CC-BY-NC-ND-4.0 → `research-only` | **solo evaluación** | en uso (`dataset/public`) |
| [BarBeR](https://ditto.ing.unimore.it/barber/) (Vezzali et al. 2024), 8 748 imágenes 1D+2D con polígono y valor | real | por fuente (agregado); descarga con cuenta | — | pendiente: requiere registro del autor |
| InventBar / ParcelBar (Kamnardsiri et al. 2022) | real | CC-BY-4.0 | — | sin valores (solo cajas); Kaggle con login |
| Dubská / Szentandrási QR | real | CC-BY-4.0 | — | enlaces caídos (404) |

## Splits de `public` (F10.1, 2026-10-12)

`b = sha1(valor) % 10`: `b < 5` dev (1288 imágenes / 1061 objetos), `5 ≤ b < 8` test (818 / 663), `b ≥ 8` holdout
(499 / 425). Hasta el 2026-10-12 el split era `b < 3` dev / resto test, y el test antiguo se usó para decidir cambios
a nivel de muestra (conflictos, verify, deblur). El dev nuevo = dev antiguo + 523 del test antiguo; test y holdout
nuevos = 100 % del test antiguo → **semi-ciegos**. El estimador limpio será la captura `device` v2.
