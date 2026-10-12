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

## Conjuntos derivados de `public` (F10.3, `public/derive.py`)

Localización con zxing-cpp Python **3.1.1** (opciones por defecto; la API 3.x no tiene `try_harder`): 1898 de 2605
imágenes (73 %). La extensión de las barras sobre la línea central / largo del cuadrilátero tiene mediana 1,001 →
`L` abarca solo las barras y el módulo es `L/95` (EAN-13) o `L/67` (EAN-8).

| Dataset | Qué es | Muestras (dev / test / holdout) | Uso |
|---|---|---|---|
| `public-neg` | Recortes fuera de 1,5·L × 1,2·L, ≤ 2 por imagen, sin lectura de zxing-cpp, revisados a mano | 92 / 58 / 51 | Control de regresión de falsas de qhago (y qhago+ai). **No** compara motores |
| `public-blur` | Imágenes `normal` con desenfoque gaussiano σ 0,6/0,9/1,2 módulos, disco y movimiento (varianza de σ 0,9), ruido σ 2, JPEG 85 | 4575 / 2885 / 1805 (EAN-8: 37 / 23 / 18 objetos) | Aprobar mejoras (B), **no** gates |

Sesgos conocidos:
- Solo imágenes que zxing-cpp localiza en nítido (las fáciles).
- Negativas: filtradas por un lector de la familia zxing → FP ≈ 0 para zxing por construcción. Rendimiento bajo
  (objetivo ≥ 200 en dev no alcanzado: 92): en estas fotos el código mide de mediana 1,4× el lado corto y casi no
  queda zona libre. Plan B del SDD: se complementan con las 67 negativas de `device/dev`.
- Revisión visual de las 206 negativas generadas: 5 con barras visibles (códigos secundarios: `public` es
  `complete: false`) → `public/neg-exclude.txt`.
- `public-blur`: el gaussiano coincide con el modelo del lector deblur (por eso las variantes disco/movimiento y el
  control con `defocus` real y `device`). σ nominal: el desenfoque propio de la foto se suma.
- Calibración (F10.L): `blur-0.9`, `blur-1.2` y `disk-0.9` saturan (0 % con todos los motores). Solo `blur-0.6` y
  `motion-0.9` discriminan; para una iteración posterior, σ 0,4-0,7.
