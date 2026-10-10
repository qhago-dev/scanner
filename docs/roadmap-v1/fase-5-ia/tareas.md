# Fase 5 — Tareas

## F5.1 — Generador sintético v2
**Esfuerzo**: 2 d · **Archivos**: `training/data/synth/`
- [ ] Render de 13 formatos con esquinas exactas
- [ ] Fondos reales solo CC0/CC-BY con licencia registrada
- [ ] Augmentaciones: perspectiva, curvatura, pliegue, glare, blur, ruido, JPEG
- [ ] 200 k muestras con semilla fija; visualizador de muestras

## F5.2 — Etiquetado de esquinas reales
**Esfuerzo**: 3 d · **Archivos**: `apps/demo/collect/` (modo esquinas)
- [ ] Prellenado con esquinas de ZXing cuando lee
- [ ] Etiquetado manual del resto del split `dev`
- [ ] Subdivisión `dev-train`/`dev-val` por objeto físico
- [ ] Export a `training/data/real` con filtro de licencia (own/CC0/CC-BY) + test

## F5.3 — Modelo y entrenamiento
**Esfuerzo**: 5-7 d (incluye iteraciones) + GPU cloud · **Archivos**: `training/models/`, `training/train/train_detector.py`
- [ ] Revisar NanoDet-Plus + cabeza de keypoints contra referencia
- [ ] Entrenamiento con config versionada (`training/configs/detector-v1.yaml`)
- [ ] Logs y checkpoints fuera de git; registrar métricas por época

## F5.4 — Export y cuantización
**Esfuerzo**: 1 d · **Archivos**: `training/export/`
- [ ] ONNX opset 17, verificación numérica PyTorch vs ORT (tolerancia documentada)
- [ ] INT8 estático con 500 imágenes de calibración; FP16 para WebGPU
- [ ] Verificar carga en ORT Web WebGPU y WASM

## F5.5 — `sa_warp_quad` en el motor
**Esfuerzo**: 4h · **Archivos**: `packages/engine-wasm/src/warp.cpp`
- [ ] Homografía + warp bilineal sobre luma
- [ ] Tests golden

## F5.6 — Interfaz de plugins en el scanner
**Esfuerzo**: 4h · **Archivos**: `packages/scanner/src/plugins.ts`
- [ ] `ScannerPlugin` (`init`, `onFrame`, `dispose`) ejecutado en el worker; descriptor serializable en main thread
- [ ] Subpath `@qhago/scanner/worker-host` y opción `workerFactory` (reservada en F4)
- [ ] Error claro si hay plugin sin worker compatible

## F5.7 — Paquete `@qhago/ai`
**Esfuerzo**: 1,5 d · **Archivos**: `packages/ai/`
- [ ] `aiWorker()` + entry `@qhago/ai/worker`
- [ ] `aiDetector()` con opciones del diseño
- [ ] Ejemplos Vite y webpack con `@qhago/ai` (bundler resuelve worker + ORT)
- [ ] Preproceso NCHW, NMS en TS, mapeo de coordenadas letterbox → original
- [ ] Backend auto WebGPU → WASM; caché del modelo con Cache API
- [ ] `peerDependencies`: `onnxruntime-web` con rango probado (p. ej. `^1.22`) y `@qhago/scanner` con rango explícito mientras sea 0.x (`>=0.4.0-0 <1.0.0` durante 0.x, para aceptar pre-releases; `^1.0.0` tras la 1.0), porque `^0.y` solo acepta la misma minor
- [ ] Ejemplo Vite con `worker: { format: "es" }` documentado

## F5.8 — Evaluación y gate G5
**Esfuerzo**: 1-2 d
- [ ] mAP y error de esquinas en `dev-val`
- [ ] Bench `scanai+ai` vs `scanai` en `test`; ablaciones
- [ ] Medición en dispositivo Android gama media de referencia
- [ ] Decisión documentada: publicar o archivar

## F5.9 — Model card y publicación
**Esfuerzo**: 3h · **Archivos**: `packages/ai/MODEL_CARD.md`
- [ ] Datos, licencias, métricas, limitaciones, uso previsto
- [ ] Publicar `@qhago/ai@0.x.y-<pre-tag>.N` con el pre-tag vigente del monorepo (modo pre global); fuera de modo pre, publica en `latest` como 0.x hasta estabilizarse
