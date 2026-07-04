# Sprint 3 — Lista de tareas

## T3.1 — Auditar y mejorar el dataset sintético

**Esfuerzo**: 4h
**Archivos**: `training/data/synthetic_barcodes.py`

- [ ] Inspeccionar visualmente 50 muestras de cada Dataset class
- [ ] Ajustar generación de 1D: asegurar que los patrones de barras son realistas
- [ ] Ajustar generación de QR: verificar que el patrón es reconocible
- [ ] Agregar DataMatrix y PDF417 al generador sintético
- [ ] Agregar más variaciones de fondo (texturas, gradientes, patrones)
- [ ] Verificar que las bounding boxes de ground truth son correctas

## T3.2 — Entrenar detector NanoDet

**Esfuerzo**: 4h setup + 3h GPU
**Depende de**: T3.1
**Archivos**: `training/train/train_detector.py`

- [ ] Ejecutar `train_detector.py --num-samples 100000 --epochs 100`
- [ ] Monitorear curvas de loss (train vs val) para detectar overfitting
- [ ] Si val_loss no mejora en 15 epochs → early stop, ajustar LR
- [ ] Validar mAP@0.5 sobre 1000 imágenes de test
- [ ] Guardar checkpoint con mejor val_loss
- [ ] Visualizar predicciones sobre 20 imágenes de test

## T3.3 — Entrenar ESRGAN Tiny

**Esfuerzo**: 2h setup + 4h GPU
**Archivos**: `training/train/train_sr.py`

- [ ] Ejecutar `train_sr.py --num-samples 50000 --epochs 50`
- [ ] Monitorear PSNR en validación cada 5 epochs
- [ ] Verificar visualmente que 64→128 upscale es nítido
- [ ] Si GAN mode colapsa → reducir `--adv-weight`

## T3.4 — Entrenar Deblur UNet

**Esfuerzo**: 2h setup + 3h GPU
**Archivos**: `training/train/train_deblur.py`

- [ ] Ejecutar `train_deblur.py --num-samples 80000 --epochs 80`
- [ ] Verificar que el modelo aprende a quitar motion blur y defocus blur
- [ ] Medir PSNR en validación

## T3.5 — Entrenar Perspective CNN y Autofocus

**Esfuerzo**: 1h setup + 2h GPU (combinado)
**Archivos**: `training/train/train_perspective.py`, `training/train/train_autofocus.py`

- [ ] Ejecutar ambos scripts (son independientes, pueden correr en paralelo si hay 2 GPUs)
- [ ] Validar Corner MAE < 3px en 256x256
- [ ] Validar Autofocus accuracy > 92%

## T3.6 — Exportar y cuantizar a ONNX

**Esfuerzo**: 2h
**Archivos**: `training/export/export_all_onnx.py`

- [ ] Ejecutar `export_all_onnx.py --checkpoints ./checkpoints --quantize`
- [ ] Verificar que cada .onnx carga sin errores en `onnxruntime`
- [ ] Verificar tamaño cuantizado < targets (3.5, 0.8, 1.2, 2.0, 1.5 MB)
- [ ] Verificar que la precisión post-cuantización no degrada >2%
- [ ] Test de inferencia con `onnxruntime` Python: medir latencia

## T3.7 — Subir modelos a ubicación servible

**Esfuerzo**: 1h

- [ ] Mover `models/*.onnx` a directorio público o CDN
- [ ] Actualizar `DEFAULT_MODEL_URLS` en `sdk/src/AIScanner.ts` con URLs reales
- [ ] Verificar CORS headers en el servidor de modelos
- [ ] Agregar `Content-Type: application/octet-stream`

---

## Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Dataset sintético no es suficientemente realista | Alto | Iterar en el generador: más variación de fondo, blur, iluminación |
| Overfitting en dataset sintético | Medio | Aumentar augmentación, agregar dropout, reducir capacidad |
| GPU no disponible | Alto | Usar cloud (Lambda Labs $0.50/hora, vast.ai $0.20/hora) |
| ONNX opset no compatible con ORT Web | Medio | Usar opset 13, evitar ops no soportadas en WebGL backend |
| Cuantización degrada precisión | Medio | Medir antes/después, usar calibration data si es necesario |

## Definición de Done

- [ ] Los 5 archivos `.onnx` existen en `models/` con tamaños bajo target
- [ ] Cada modelo fue evaluado y supera la métrica mínima
- [ ] `onnxruntime.InferenceSession` carga todos los modelos sin error
- [ ] Inferencia de prueba en Python retorna resultados razonables
- [ ] Los modelos están accesibles vía HTTP (CDN o servidor local)
