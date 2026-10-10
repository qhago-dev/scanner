# Fase 5 — Detector IA opcional (`@qhago/ai`)

**Esfuerzo**: 14-20 días + GPU en cloud (p. ej. 1 GPU de 24 GB, ~40-80 h de cómputo estimadas) · **Prioridad**: Media (no bloquea 1.0) · **Depende de**: F5.1-F5.4 → F1 · F5.5 en adelante → F4 (API con `plugins` y `workerFactory` reservados) · **Versión**: `@qhago/ai@0.x` (ciclo propio)

## Problema

ZXing localiza bien códigos grandes y nítidos, pero falla cuando el código ocupa poca área del frame, está muy inclinado, curvado o en escenas con mucho ruido visual. Ahí un detector aprendido puede indicar **dónde** y **con qué geometría** está el código, para que el motor clásico decodifique un recorte rectificado a resolución nativa.

## Requerimiento

Un único modelo detector con keypoints (ADR-04), entrenado con datos sintéticos + reales, que se integre como **plugin** del scanner y se publique solo si supera el gate G5.

### Debe

1. **Modelo**: entrada 320×320 (o 416×416 si el benchmark lo justifica), salida por objeto: caja, 4 esquinas, clase (`1d`, `qr`, `datamatrix`, `pdf417`, `aztec`), confianza. Arquitectura con licencia Apache/MIT/BSD (NanoDet-Plus, RTMDet-tiny de MMDetection o equivalente). **Prohibido Ultralytics/YOLOv5+ (AGPL)**.
2. **Datos**: generador sintético con fondos reales **solo con licencia CC0/CC-BY** (p. ej. Open Images filtrado por licencia; COCO no, porque mezcla licencias no comerciales de Flickr), curvatura cilíndrica, reflejos, blur, compresión JPEG; + imágenes reales etiquetadas de F1 **solo del split `dev`** (el `test` nunca se usa para entrenar).
   - **Filtro de licencia obligatorio**: al exportar a `training/data/real` solo pasan muestras con `license` ∈ {`own`, `CC0`, `CC-BY-*`}; las `research-only` u otras no comerciales quedan fuera (ADR-09). Un test del script de export lo verifica y el model card lista las licencias usadas.
   - Para evitar fuga de datos, `dev` se subdivide por objeto físico en `dev-train` (80 %) y `dev-val` (20 %). El modelo entrena con sintético + `dev-train`; las métricas del modelo se miden en `dev-val`; el gate G5 se mide en `test`.
3. **Export**: ONNX opset ≥ 17, cuantización INT8 (estática con calibración) y variante FP16 para WebGPU; tamaño ≤ 4 MB.
4. **Runtime**: `onnxruntime-web` como `peerDependency`; backends WebGPU (modelo FP16) → WASM (modelo INT8; SIMD, threads si `crossOriginIsolated`). Corre en el mismo worker que el motor.
   - **Carga en el worker**: el worker de `@qhago/scanner` está precompilado y no puede importar `@qhago/ai` (dependencia opcional que no conoce). Por eso `@qhago/ai` publica su propio entry de worker (`@qhago/ai/worker`) que importa `@qhago/scanner/worker-host` + el plugin, y el scanner lo usa a través de la opción `workerFactory` reservada en F4. El bundler del usuario resuelve ambos estáticamente.
5. **Integración** como plugin:
   ```ts
   import { createScanner } from "@qhago/scanner";
   import { aiDetector, aiWorker } from "@qhago/ai";
   createScanner({
     workerFactory: aiWorker,                       // worker que incluye ORT + plugin
     plugins: [aiDetector({ when: "fallback" })],   // opciones serializables, se envían al worker
   });
   ```
   - `decode()` de imágenes también acepta `{ plugins, workerFactory }` (mismo mecanismo).
   - `when: "fallback"`: solo se ejecuta si el motor clásico no leyó nada en `escalateAfterFrames` frames (opción del scanner, default 3; un único umbral compartido con el barrido rotativo de F3).
   - `when: "always"`: detecta en todos los frames (multi-código denso).
   - Recorte rectificado con homografía desde las 4 esquinas, sobre el frame que tiene el worker a máxima resolución disponible (no el 320×320 del detector). En ruta 1 (`VideoFrame`) es la resolución nativa; en ruta 2 es `processingWidth`, que el plugin puede subir (`processingWidth: "native"`) cuando la IA está activa.
   - Vite: el worker de `@qhago/ai` usa imports dinámicos de ONNX Runtime, así que requiere `worker: { format: "es" }` en `vite.config` (ADR-06); se documenta y se prueba en el ejemplo.
6. **Política anti-alucinación** (ADR-03): el modelo no modifica píxeles; solo propone ROIs y geometría.
7. **Distribución**: el `.onnx` dentro del paquete npm; carga perezosa; caché con Cache API.
8. **Reproducibilidad**: scripts de entrenamiento con semillas, versiones fijas, model card (datos, licencias, métricas, limitaciones).

### No debe

- Aumentar la false_read_rate.
- Cargar ONNX Runtime si el plugin no se usa.

## Criterios de aceptación (gate G5)

- [ ] mAP@0.5 ≥ 0,85 y error medio de esquinas ≤ 3 % del lado en `dev-val` (umbral se revisa tras primera iteración). mAP por clase solo se reporta para clases con ≥ 30 instancias en `dev-val`; si una clase (p. ej. Aztec) no llega, se completa `dev-val` con capturas nuevas antes del gate.
- [ ] En `bench` split `test`, subconjunto adverso (`small`, `perspective`, `curved`, `multi`, `damaged`): recall **+10 pp** o más sobre el scanner sin IA **y** "mejor" según la definición estadística del README.
- [ ] false_read_rate igual o menor.
- [ ] Latencia del detector p95 ≤ 25 ms (WebGPU) / ≤ 60 ms (WASM) en `android-mid` (F1, `bench/HARDWARE.md`), medida en el dispositivo real (CI no tiene WebGPU).
- [ ] Instalar `@qhago/scanner` sin `@qhago/ai` no descarga ONNX Runtime ni modelos (verificado con un ejemplo y `size-limit`).
- [ ] Model card publicada.
- [ ] Si no se cumple: el paquete no se publica y se documenta el resultado en `bench/results/`.
