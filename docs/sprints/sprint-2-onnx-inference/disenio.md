# Sprint 2 — Diseño: Bridge Rust ↔ ONNX Runtime Web

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│  Rust (core/src/onnx_runner.rs)                             │
│                                                             │
│  struct OnnxRunner {                                        │
│      model_ids: HashMap<ModelType, u32>,  // ID en lado JS  │
│  }                                                          │
│                                                             │
│  impl OnnxRunner {                                          │
│      fn run_detector(&self, input, shape) {                 │
│          // 1. Serializar input a Vec<u8> (raw bytes f32)   │
│          // 2. Llamar a JS: ort_run(id, input_bytes, shape) │
│          // 3. Deserializar output de Vec<u8>               │
│          // 4. Retornar (boxes, scores, classes)            │
│      }                                                      │
│  }                                                          │
└──────────────────────┬──────────────────────────────────────┘
                       │  import js function
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  JS (sdk/src/onnx-bridge.ts)                                │
│                                                             │
│  class OnnxBridge {                                         │
│      sessions: Map<number, ort.InferenceSession>            │
│                                                             │
│      async loadModel(id, bytes): cargar en ORT              │
│      runSession(id, inputData, shape): ejecutar inferencia  │
│      getModelInfo(id): input/output names + shapes          │
│  }                                                          │
│                                                             │
│  // Expuesto como import al módulo WASM de Rust             │
│  export function ort_load_model(id, bytes_ptr, len)         │
│  export function ort_run(id, input_ptr, len, shape): ptr    │
│  export function ort_free_model(id)                         │
└──────────────────────┬──────────────────────────────────────┘
                       │  usa
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  ONNX Runtime Web (onnxruntime-web, MIT)                    │
│                                                             │
│  Backends: WebGL (GPU) o WASM (CPU)                        │
│  Carga .onnx → InferenceSession                              │
│  Ejecuta session.run({ input: Tensor }) → { output: Tensor } │
└─────────────────────────────────────────────────────────────┘
```

## Flujo de inferencia (ejemplo: detector)

```
Rust                          JS                         ORT Web
 │                             │                            │
 │─ process_frame(data, w, h)  │                            │
 │                             │                            │
 │  ┌─ preprocesar imagen ────▶│                            │
 │  │  (320x320, normalize)    │                            │
 │  │                          │                            │
 │  ├─ llamar ort_run(         │                            │
 │  │    model_id=0,           │                            │
 │  │    input_ptr=0x1000,     │                            │
 │  │    input_len=1228800,    │                            │
 │  │    shape=[1,3,320,320]   │                            │
 │  │  )                       │                            │
 │  │                          │                            │
 │  │                          ├─ armar Float32Array        │
 │  │                          │  desde memoria WASM        │
 │  │                          │                            │
 │  │                          ├─ new ort.Tensor(           │
 │  │                          │    "float32", data, shape  │
 │  │                          │  )                         │
 │  │                          │                            │
 │  │                          ├─ session.run({         ───▶│
 │  │                          │    input: tensor            │
 │  │                          │  })                         │
 │  │                          │                            │
 │  │                          │◀─── { boxes, scores,       │
 │  │                          │      classes }              │
 │  │                          │                            │
 │  │                          ├─ copiar outputs a          │
 │  │                          │  memoria WASM              │
 │  │                          │                            │
 │  │◀─ retornar ptr_output ───┤                            │
 │  │                          │                            │
 │  ├─ leer outputs del heap   │                            │
 │  ├─ NMS, filtrar confianza  │                            │
 │  └─ retornar Detection[]    │                            │
```

## Decisiones de diseño

### Transporte de tensores: SharedArrayBuffer vs copia

**Opción A: Memoria compartida (SharedArrayBuffer)**
- Rust escribe input en el heap WASM, JS lee directamente (zero-copy)
- Requiere cabeceras COOP/COEP en el servidor
- Solo disponible en contextos seguro (HTTPS, localhost)

**Opción B: Copia explícita (postMessage o llamada a función)**
- Rust serializa a buffer, JS copia, arma tensor
- Copia ~1.2 MB por frame (320x320x3x4 bytes) → ~0.3ms en memoria moderna
- Funciona en cualquier contexto, sin requisitos de cabeceras

**→ Decisión: Opción B (copia) por compatibilidad.** La penalidad de copia (~0.3ms) es insignificante comparada con los ~11ms de inferencia total.

### Backend de ORT Web

| Backend | Latencia (320x320) | Disponibilidad |
|---------|---------------------|----------------|
| WebGL | ~3ms | Chrome, Edge, Opera |
| WebGPU | ~1ms | Chrome 113+, Edge 113+ |
| WASM (CPU) | ~8ms | Todos los navegadores |

**→ Decisión**: Intentar WebGL primero, fallback a WASM. WebGPU cuando esté disponible (detección automática).

```typescript
const session = await ort.InferenceSession.create(modelBytes, {
  executionProviders: ["webgl", "wasm"],
  graphOptimizationLevel: "all",
  enableCpuMemArena: true,
});
```

## Carga de modelos

```typescript
// sdk/src/onnx-bridge.ts

class OnnxBridge {
  private sessions: Map<number, ort.InferenceSession> = new Map();
  private nextId = 1;

  // Llamado desde Rust
  async loadModel(id: number, modelBytes: Uint8Array): Promise<void> {
    const session = await ort.InferenceSession.create(modelBytes, {
      executionProviders: ["webgl", "wasm"],
      enableCpuMemArena: true,
    });
    this.sessions.set(id, session);
  }

  // Llamado desde Rust en cada frame
  runSession(
    id: number,
    inputData: Float32Array,
    inputShape: number[],
    inputName: string,
    outputName: string,
  ): Float32Array {
    const session = this.sessions.get(id)!;
    const tensor = new ort.Tensor("float32", inputData, inputShape);
    const results = session.run({ [inputName]: tensor });
    return results[outputName].data as Float32Array;
  }

  getInputShape(id: number): number[] { ... }
  getOutputShape(id: number): number[] { ... }
}
```
