# Fase 5 — Diseño

## Flujo con el plugin

```
frame ──► motor clásico (ROI/estrategia) ──► ¿lectura válida? ── sí ──► fusión
                 │ no (k frames)                                   ▲
                 ▼                                                 │
          detector ONNX (320×320, letterbox)                       │
                 │ cajas + 4 esquinas por objeto                   │
                 ▼                                                 │
   para cada objeto (top-N por confianza):                         │
     homografía esquinas → rectángulo destino                      │
     warp bilineal sobre frame ORIGINAL (resolución nativa)        │
     motor clásico (isPure=false, formato sugerido por clase) ─────┘
```

- Tamaño del rectángulo destino: lado largo = máx(lado estimado en el original, 256 px), relación de aspecto de la clase (1D ≈ 3:1, 2D ≈ 1:1, PDF417 ≈ 3:1).
- El warp se implementa en C++ dentro de `engine-wasm` (`sa_warp_quad`), para no copiar el frame.
- La clase restringe formatos en el intento (más rápido, menos falsos positivos); si falla, un segundo intento con todos los formatos configurados.

## Modelo

| Aspecto | Elección inicial | Alternativa |
|---|---|---|
| Arquitectura | NanoDet-Plus-m (Apache 2.0) + cabeza de 4 keypoints | RTMDet-tiny + cabeza de keypoints (Apache 2.0) |
| Backbone | ShuffleNetV2 1.0× | MobileNetV3-small |
| Entrada | 320×320 RGB, letterbox | 416×416 |
| Pérdidas | GFL + DFL (cajas) + L1/Wing (esquinas) + orden de esquinas canónico | — |
| Export | ONNX opset 17, NMS fuera del grafo (en TS) para compatibilidad WebGPU | NMS dentro si ORT lo soporta en ambos backends |

El código de `training/models/nanodet.py` actual sirve de punto de partida; se revisa contra la implementación de referencia.

## Datos

```
training/data/
├── synth/            # generador: códigos (13 formatos) sobre fondos reales
│   ├── render.py     #   perspectiva, curvatura cilíndrica, pliegues, glare, blur, ruido, JPEG q30-95
│   └── backgrounds/  #   lista de URLs + licencias CC0/CC-BY (no en git)
├── real/             # export desde bench/dataset/real (solo dev-train / dev-val) con corners
└── splits.yaml
```
- Entrenamiento en GPU de cloud (no local); coste y horas registrados en el model card.
- Proporción inicial: 200 k sintéticas + todas las reales `dev-train` (sobremuestreadas ×10). `dev-val` solo para validación/early stopping; `test` nunca se toca.
- Las esquinas reales se etiquetan con la herramienta de F1.2 (modo "esquinas") o se derivan de ZXing cuando lee.

## Runtime en el navegador

```ts
// @qhago/ai
export function aiWorker(): Worker;  // new Worker(new URL("./worker.js", import.meta.url), { type: "module" })
                                     // worker.js = import "@qhago/scanner/worker-host" + registro del plugin + ORT
export function aiDetector(opts?: {
  when?: "fallback" | "always";
  minConfidence?: number;            // 0.4
  maxObjects?: number;               // 5
  backend?: "auto" | "webgpu" | "wasm";
  modelUrl?: string | URL;           // default: new URL("./models/detector.int8.onnx", import.meta.url)
}): ScannerPluginDescriptor;        // serializable; la implementación vive en el worker
```
- Interfaz `ScannerPlugin` definida en F5.6 (`onFrame(frame, ctx) → Promise<Roi[]>`), ejecutada en el worker. Se añade a la API pública como extensión compatible (minor), sin romper lo congelado en F4.
- `aiDetector()` devuelve un descriptor serializable (`{ name: "ai-detector", options }`); la implementación vive en el worker de `@qhago/ai`. Si se pasa el plugin sin `workerFactory: aiWorker`, el scanner lanza `ScanError("UNSUPPORTED")` con un mensaje que lo explica.
- `@qhago/scanner` exporta `@qhago/scanner/worker-host` (subpath) para que otros paquetes compongan workers.
- `import("onnxruntime-web/webgpu")` dinámico; si falla, `onnxruntime-web` WASM.
- `ort.env.wasm.wasmPaths` apuntando a los assets del paquete `onnxruntime-web` (documentar copia en Vite/webpack).
- Preprocesado (letterbox + normalización a NCHW float32/float16) en WASM propio o TS con `Float32Array` reutilizable; nada de HWC (bug del código actual).

## Evaluación

- `training/eval/` calcula mAP y error de esquinas.
- Integración medida con `bench` (motor `scanai+ai`), comparando contra `scanai` sin IA en el mismo split `test`.
- Ablaciones: entrada 320 vs 416, INT8 vs FP16, `fallback` vs `always`.
