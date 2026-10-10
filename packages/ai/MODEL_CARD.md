# Model card — detector-v1-lite (`@qhago/ai`)

> **Estado: experimental, sin publicar** (`"private": true`). No supera el gate G5 (ver "Evaluación").
> Solo es una ayuda para los casos en que el motor clásico no lee; no lo sustituye.

## Uso previsto

El modelo localiza códigos de barras y 2D, con sus 4 esquinas, en frames de cámara o en imágenes donde ZXing no
encuentra el símbolo: poca luz, perspectiva fuerte, superficies curvas o códigos dañados. Después, el motor
rectifica cada región en la resolución original (`sa_read_quad`) y la decodifica con ZXing. **El modelo no
decodifica**: no puede producir lecturas por sí mismo, así que por diseño no añade lecturas falsas.

Fuera de alcance: OCR, decodificación, formatos distintos de los 13 de la versión 1.0, y vigilancia o identificación
de personas.

## Modelo

| | |
|---|---|
| Arquitectura | CenterNet-lite propio (MIT). Backbone depthwise y FPN a stride 4. Un bloque depthwise compartido alimenta tres convoluciones 1×1: heatmap (5 clases), offset y 4 esquinas |
| Clases | `1d`, `qr`, `datamatrix`, `pdf417`, `aztec` |
| Entrada | 1×1×320×320, luminancia en [0, 1], letterbox con relleno 114/255 |
| Salidas | `heat` [1,5,80,80] (sigmoid), `offset` [1,2,80,80], `corners` [1,8,80,80] (×32 px). La detección de picos y la supresión se hacen en TS |
| Parámetros / cómputo | 0,22 M / 0,24 GMAC |
| Pesos iniciales | Ninguno: se entrenó desde cero, sin pesos de ImageNet ni sus licencias |
| Export | ONNX opset 17. `detector.int8.onnx` (QDQ estático, 329 KB; las convoluciones finales y el Sigmoid se quedan en FP32). `detector.fp16.onnx` (454 KB, para WebGPU) |

Hay dos desviaciones respecto al diseño original:

- **Arquitectura.** ADR-04 permitía "NanoDet-Plus o equivalente", y se eligió CenterNet-lite. Predice las esquinas
  directamente, solo usa Conv/BN/ReLU/Upsample (funciona en WebGPU y WASM sin operadores raros) y es pequeño.
- **Cabezas.** La primera versión (detector-v1) tenía tres cabezas convolucionales 3×3 y costaba 1,30 GMAC, el 85 %
  en las cabezas. Daba 77-79 ms en WASM. Con la cabeza compartida, el coste baja a 0,24 GMAC y la latencia a la
  mitad, con el mismo recall. v1 sigue disponible con `--head full`.

## Datos

| Fuente | Uso | Licencia |
|---|---|---|
| Sintético (`training/data/synth_det.py`): 100 000 imágenes, semilla 1234. Símbolos reales de los 13 formatos generados con el writer de zxing-cpp (Apache-2.0), sobre fondos procedurales. Degradaciones: perspectiva, rotación, curvatura cilíndrica, desenfoque de movimiento y de foco, glare, poca luz, ruido, JPEG q40-92 e inversión. Distractores: texto, rayas y rejillas | 98 % entrenamiento, 2 % validación | Generado (propio) |
| Fondos fotográficos CC0/CC-BY | No usados | — |
| Capturas reales (F1, `dev-train`) | No usadas: el dataset real aún no existe | — |

No hay imágenes de terceros ni datos personales (ADR-12).

## Entrenamiento

- **Entorno.** PyTorch 2.12, una RTX 3060 Laptop (6 GB), en local y sin coste de nube.
- **Configuración.** 30 épocas, batch 128. AdamW con lr 3e-3 y wd 1e-4, warmup de 500 pasos y después coseno. AMP.
- **Pérdidas y aumentos.** Focal loss en el heatmap y L1 en offset y esquinas. Aumentos: flip horizontal,
  brillo y contraste.
- **Coste.** 1,26 h de GPU (v1: 1,77 h).
- **Selección.** Mejor época: 25 (por mAP@0.5 de validación).

Comando: `train_detector.py --head shared` (la configuración de cada ejecución se guarda en
`runs/*/config.json`, fuera de git).

## Evaluación

### Detector (validación sintética, 1 000 imágenes no vistas en entrenamiento)

| Variante | mAP@0.5 | Error de esquinas (÷ lado) | CPU ORT p50 (x86, multihilo) |
|---|---|---|---|
| FP32 | 0,979 | 3,4 % | 5,0 ms |
| FP16 | 0,978 | 3,4 % | 5,8 ms |
| INT8 (el que se distribuye) | 0,968 | 4,5 % | 3,3 ms |

- **AP por clase (INT8):** 1D 0,987 · QR 0,992 · DataMatrix 0,907 · PDF417 0,984 · Aztec 0,971.
- **Paridad ONNX FP32 vs PyTorch:** |Δ| máximo 3,4e-5.
- **Pre y postproceso:** la implementación TS da lo mismo que la de Python (`test/unit/golden.test.ts`).

### Integración (bench, dataset sintético, split `test`, 399 muestras)

| Motor | Recall (muestra) | Lecturas falsas |
|---|---|---|
| qhago (balanced) | 81,0 % | 1 (0,3 %) |
| qhago + detector-v1 (fallback) | 85,5 % | 1 (0,3 %) |
| qhago + **detector-v1-lite** (fallback) | **86,0 %** | 1 (0,3 %) |

Con lite, Δ = +4,9 pp (IC 95 % bootstrap por objeto [+2,9; +7,3]), veredicto "mejor".

- **Dónde ayuda:** poca luz, dañados (+10 pp), perspectiva (+6 pp), curvos (+6 pp), pequeños (+4 pp).
- **Dónde no ayuda:** desenfoque, movimiento y multi-código.

Informes: `bench/results/2026-10-10-lite-synthetic-test.md` (lite) y `2026-10-10-695c8e0-synthetic-test.md` (v1).

### Fotos reales (2026-10-10, datasets públicos)

Evaluación sin reentrenar (el modelo nunca vio fotos reales):

- **Detector** en ArTe-Lab 1D extended (365 fotos de móvil con máscara, CC BY 3.0): mAP@0.5 = **0,94** (INT8
  lite) / 0,96 (INT8 v1). El error de esquinas frente a la máscara (11 %) no es comparable: las máscaras cubren
  solo las barras y el modelo predice el símbolo con su zona de silencio. Script: `training/eval/eval_real_masks.py`.
- **Integración** en `bench/dataset/public`, split `test` (1 840 fotos EAN-13/EAN-8 de ArTe-Lab, KAIST y Muenster):

| Motor | Recall | Desenfocadas (n=152) | Lecturas falsas |
|---|---|---|---|
| qhago | 76,6 % | 11,8 % | 7 (0,5 %) |
| qhago + detector-v1-lite | **83,9 %** | **32,9 %** | 9 (0,6 %) |
| zxing-wasm (referencia) | 71,4 % | 5,3 % | 22 (1,6 %) |

Δ = +7,0 pp (IC 95 % [+5,5; +8,6]), "mejor", lecturas falsas iguales (Δ 0,0 pp). Informe:
`bench/results/2026-10-10-fba9312-public-test.md`. Con la regla de conflictos 1D de `@qhago/scanner` (descarta
lecturas lineales contradictorias sobre el mismo símbolo) las falsas bajan a 7 y 9 sin cambiar el recall con IA:
`bench/results/2026-10-10-793ff50-conflicts-public-test.md`. Limitación: solo hay 1D (EAN) reales; sin 2D reales con licencia
abierta de descarga directa (BarBeR requiere cuenta).

### Latencia en navegador

Medido en Chrome 156 de escritorio (i9-12900H, con otras cargas en paralelo), ORT Web WASM con un hilo, de un frame
1280×720 hasta las detecciones:

- detector-v1: 77-79 ms p50.
- detector-v1-lite: **38-47 ms p50**, de los que unos 4-5 ms son el letterbox.

En móviles será varias veces más. Por eso, en vídeo, el plugin corre como mucho cada `intervalMs` (300 ms por
defecto) y solo en modo `fallback`.

### Gate G5

| Criterio | Resultado | |
|---|---|---|
| mAP@0.5 ≥ 0,85 en `dev-val` | 0,968 sintético; **0,94 en 365 fotos reales** (ArTe-Lab, solo 1D) | ✔ (1D); falta 2D real |
| Error de esquinas ≤ 3 % | 4,5 % INT8 (3,4 % FP32) | ✘ |
| Subconjunto adverso de `test`: +10 pp y "mejor" | Sintético +5,3 pp. Real: +7,0 pp global, **+21,1 pp en desenfocadas** (las fotos públicas no traen las etiquetas small/perspective/curved/multi/damaged) | ✘ / sin medir exactamente |
| `false_read_rate` igual o menor | Igual | ✔ |
| Latencia p95 ≤ 60 ms (WASM) / 25 ms (WebGPU) en `android-mid` | 38-47 ms p50 en escritorio | ✘ previsible en móvil; sin medir en el dispositivo |
| Sin `@qhago/ai`, no se descarga ORT ni modelos | `@qhago/scanner` no tiene dependencias | ✔ |

**Decisión (2026-10-10, revisada con fotos reales): sigue sin publicarse**, pero la evidencia real es favorable
(+7 pp sin lecturas falsas extra). Faltan: latencia en `android-mid`, 2D reales y el subconjunto adverso etiquetado. El paquete queda en el repo como experimental, con `"private": true`; hay
que quitarlo cuando pase G5. Para reconsiderarlo hace falta:

1. El dataset real de F1, con `dev-train` y `dev-val`.
2. Fondos fotográficos CC0.
3. Mejorar las esquinas en INT8: cuantizar también por canal la última capa, o distribuir FP32 (881 KB; 3,4 % de error).
4. Medir en `android-mid`.

## Limitaciones y riesgos

- **Datos.** Se entrenó solo con sintético, así que el rendimiento en fotos reales es desconocido.
- **Peso.** ONNX Runtime Web añade unos 3,7 MB gzip en WASM o 6,7 MB en WebGPU, además del modelo.
- **Clase predicha.** Solo decide el orden en que se prueban los formatos. Si se equivoca, se reintenta con todos los
  formatos configurados.
- **Sesgo de dominio.** Los fondos son procedurales. El modelo puede proponer regiones en texturas regulares (rejillas,
  texto): no produce lecturas falsas, pero gasta tiempo de decodificación.
