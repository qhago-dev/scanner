# @qhago/ai

> **Experimental, sin publicar** (`"private": true`): no supera el gate G5 — ver [MODEL_CARD.md](./MODEL_CARD.md).

Detector de códigos **opcional** para [`@qhago/scanner`](../scanner). Cuando el motor clásico no lee nada durante
unos frames, una red pequeña (CenterNet-lite, 0,39 M parámetros, 320×320) localiza los códigos y sus 4 esquinas;
el motor rectifica cada región en su resolución original y la vuelve a leer.

```ts
import { createScanner } from "@qhago/scanner";
import { aiDetector, aiWorker } from "@qhago/ai";

const scanner = createScanner({
  workerFactory: aiWorker,        // worker con el motor + el detector (ONNX Runtime Web)
  plugins: [aiDetector()],        // "fallback" por defecto
});
await scanner.start();
```

También funciona con `decode(image, { workerFactory: aiWorker, plugins: [aiDetector()] })`.

## Opciones

| Opción | Default | |
|---|---|---|
| `when` | `"fallback"` | `"always"` corre el detector en cada frame |
| `minConfidence` | `0.4` | umbral del heatmap |
| `maxObjects` | `5` | regiones por frame |
| `backend` | `"wasm"` | `"webgpu"` / `"auto"` usan el modelo FP16 y el runtime WebGPU |
| `modelUrl` | modelo del paquete | self-hosting / CDN |
| `wasmPaths` | el de `onnxruntime-web` | carpeta de los `.wasm` de ORT |
| `intervalMs` | `300` | mínimo entre inferencias en vídeo (la red cuesta ~100 ms en WASM) |
| `cache` | `true` | guarda el modelo en Cache API |

## Peso

| Recurso | Tamaño |
|---|---|
| `detector.int8.onnx` (WASM) | ~0,5 MB |
| `detector.fp16.onnx` (WebGPU) | ~0,8 MB |
| runtime ORT WASM | ~3,7 MB gzip |
| runtime ORT WebGPU | ~6,7 MB gzip |

Solo se descargan si usas el plugin. Sin `@qhago/ai`, `@qhago/scanner` no cambia de tamaño.

## Bundlers

- **Vite**: `worker: { format: "es" }` y `optimizeDeps: { exclude: ["@qhago/scanner", "@qhago/ai", "onnxruntime-web"] }`
  (ver [`apps/examples/ai-vite`](../../apps/examples/ai-vite)).
- **webpack 5**: los `new URL(…, import.meta.url)` (worker, modelo, `.wasm`) se resuelven como assets sin configuración
  (ver [`apps/examples/ai-webpack`](../../apps/examples/ai-webpack); solo `experiments.topLevelAwait` por el ejemplo).

`onnxruntime-web` es *peer dependency* (`^1.22`): instálalo junto a este paquete.

Datos, métricas y limitaciones del modelo: [MODEL_CARD.md](./MODEL_CARD.md).
