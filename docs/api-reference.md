# ScanAI SDK — API Reference

## `AIScanner`

Clase principal del SDK.

### Constructor

```typescript
new AIScanner(options?: AIScannerOptions)
```

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `options.config` | `Partial<ScanConfig>` | Configuración del scanner |
| `options.models` | `ModelConfig` | URLs de los modelos ONNX |
| `options.wasmPath` | `string` | Ruta al archivo WASM |
| `options.workerPath` | `string` | Ruta al worker JS |

### Métodos

#### `start(): Promise<void>`
Inicializa el SDK, descarga modelos y los carga en el runtime ONNX.

#### `stop(): void`
Detiene el escaneo y libera la cámara.

#### `destroy(): void`
Limpia todos los recursos, listeners y memoria.

#### `attachCamera(videoElement: HTMLVideoElement): Promise<void>`
Asocia un elemento `<video>` y comienza el loop de escaneo.

#### `processImage(image: ImageData | HTMLImageElement | HTMLCanvasElement): Promise<BarcodeResult | null>`
Procesa una imagen estática y retorna el primer código encontrado.

#### `updateConfig(config: Partial<ScanConfig>): void`
Actualiza la configuración en caliente.

#### `on(event: string, listener: ScanEventListener): () => void`
Registra un listener de eventos. Retorna una función para removerlo.

#### `off(event: string, listener: ScanEventListener): void`
Remueve un listener.

#### `once(event: string, listener: ScanEventListener): void`
Registra un listener que se ejecuta una sola vez.

#### `getState(): ScannerState`
Retorna el estado actual del scanner.

---

## Tipos

### `ScanConfig`

```typescript
interface ScanConfig {
  symbologies: Symbology[];
  enableSuperResolution: boolean;    // default: true
  enableDeblur: boolean;             // default: true
  enablePerspectiveCorrection: boolean; // default: true
  enableAutofocus: boolean;          // default: true
  enableTracking: boolean;           // default: true
  trackingSensitivity: number;       // default: 0.15
  focusThreshold: number;            // default: 0.3
  minConfidence: number;             // default: 0.5
  scanIntervalMs: number;            // default: 100
  maxResolutionWidth: number;        // default: 640
}
```

### `ModelConfig`

```typescript
interface ModelConfig {
  detectorUrl?: string;
  superResolutionUrl?: string;
  deblurUrl?: string;
  perspectiveUrl?: string;
  autofocusUrl?: string;
}
```

### `Symbology`

```typescript
enum Symbology {
  Code128 = "code128",
  Code39 = "code39",
  Code93 = "code93",
  Ean8 = "ean8",
  Ean13 = "ean13",
  UpcA = "upca",
  UpcE = "upce",
  Itf = "itf",
  Codabar = "codabar",
  QrCode = "qr_code",
  DataMatrix = "datamatrix",
  Pdf417 = "pdf417",
  Aztec = "aztec",
}
```

### `BarcodeResult`

```typescript
interface BarcodeResult {
  text: string;
  format: string;
  confidence: number;
  corners: Point[];
  timestamp: number;
}
```

### `ScanEvent`

```typescript
type ScanEvent =
  | { type: "decode"; data: BarcodeResult }
  | { type: "tracking"; data: BarcodeResult }
  | { type: "lost" }
  | { type: "focus"; focused: boolean }
  | { type: "error"; message: string }
  | { type: "ready" }
  | { type: "loading"; progress: number };
```

### `ScannerState`

```typescript
enum ScannerState {
  Idle = "idle",
  Loading = "loading",
  Ready = "ready",
  Scanning = "scanning",
  Error = "error",
}
```

---

## Eventos

| Evento | Tipo | Descripción |
|--------|------|-------------|
| `decode` | `{ data: BarcodeResult }` | Nuevo código detectado |
| `tracking` | `{ data: BarcodeResult }` | Mismo código en tracking |
| `lost` | `{}` | Código perdido del frame |
| `focus` | `{ focused: boolean }` | Cambio de enfoque |
| `error` | `{ message: string }` | Error |
| `ready` | `{}` | SDK listo para escanear |
| `loading` | `{ progress: number }` | Progreso de carga [0-1] |

---

## Ejemplo de UI

```typescript
import { AIScanner, Symbology } from "@scanai/sdk";

const video = document.getElementById("camera") as HTMLVideoElement;
const resultDisplay = document.getElementById("result") as HTMLDivElement;

const scanner = new AIScanner({
  config: {
    symbologies: [Symbology.QrCode, Symbology.Code128],
    maxResolutionWidth: 480,
  },
});

let lastResult = "";

scanner.on("decode", ({ data }) => {
  if (data.text !== lastResult) {
    lastResult = data.text;
    resultDisplay.textContent = data.text;

    // Vibrate on successful scan (mobile)
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  }
});

scanner.on("lost", () => {
  lastResult = "";
  resultDisplay.textContent = "Scanning...";
});

scanner.on("error", ({ message }) => {
  resultDisplay.textContent = `Error: ${message}`;
});

await scanner.start();
await scanner.attachCamera(video);
```

---

## Workers (Web Workers)

Por defecto, la inferencia se ejecuta en el hilo principal. Para usar un Web Worker:

```typescript
const scanner = new AIScanner({
  workerPath: "/workers/scanai-worker.js",
});
```

El worker debe exportar la misma API y comunicarse vía `postMessage`.
