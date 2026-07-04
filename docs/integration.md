# ScanAI SDK — Guía de Integración

## Instalación

### Web (JavaScript / TypeScript)

```bash
npm install @scanai/sdk
# or
yarn add @scanai/sdk
# or
pnpm add @scanai/sdk
```

### Flutter

```yaml
# pubspec.yaml
dependencies:
  scanai_sdk: ^0.1.0
```

### React Native

```bash
npm install react-native-scanai
cd ios && pod install
```

### Capacitor

```bash
npm install @scanai/capacitor
npx cap sync
```

---

## Uso básico

### 1. Crear el scanner

```js
import { AIScanner, Symbology } from "@scanai/sdk";

const scanner = new AIScanner({
  config: {
    symbologies: [
      Symbology.QrCode,
      Symbology.Code128,
      Symbology.Ean13,
    ],
    enableAutofocus: true,
    enableTracking: true,
    minConfidence: 0.6,
  },
  models: {
    detectorUrl: "/models/nanodet_barcode_int8.onnx",
    autofocusUrl: "/models/autofocus_int8.onnx",
  },
});
```

### 2. Escuchar eventos

```js
scanner.on("decode", (event) => {
  const { text, format, confidence } = event.data;
  console.log(`Scanned: ${text} (${format}, ${(confidence * 100).toFixed(0)}%)`);
});

scanner.on("tracking", (event) => {
  console.log("Tracking same code:", event.data.text);
});

scanner.on("lost", () => {
  console.log("Barcode lost from view");
});

scanner.on("focus", (event) => {
  console.log("Camera focus:", event.focused ? "in focus" : "out of focus");
});

scanner.on("error", (event) => {
  console.error("Scan error:", event.message);
});

scanner.on("ready", () => {
  console.log("Scanner ready");
});

scanner.on("loading", (event) => {
  console.log(`Loading models: ${(event.progress * 100).toFixed(0)}%`);
});
```

### 3. Inicializar y empezar a escanear

```js
// Con cámara
await scanner.start();

const videoElement = document.getElementById("camera-view");
await scanner.attachCamera(videoElement);

// Cuando termines
scanner.stop();
scanner.destroy();
```

### 4. Escanear una imagen estática

```js
const img = document.getElementById("barcode-image");
const result = await scanner.processImage(img);

if (result) {
  console.log("Found:", result.text);
} else {
  console.log("No barcode found");
}
```

---

## Configuración avanzada

### Config

```typescript
interface ScanConfig {
  symbologies: Symbology[];           // Tipos de código a detectar
  enableSuperResolution?: boolean;    // Activar super-resolución (default: true)
  enableDeblur?: boolean;             // Activar deblurring (default: true)
  enablePerspectiveCorrection?: boolean; // Corregir perspectiva (default: true)
  enableAutofocus?: boolean;          // Clasificador de enfoque (default: true)
  enableTracking?: boolean;           // Tracking adaptativo (default: true)
  trackingSensitivity?: number;       // Sensibilidad tracking [0-1] (default: 0.15)
  focusThreshold?: number;            // Umbral de enfoque [0-1] (default: 0.3)
  minConfidence?: number;             // Confianza mínima IA [0-1] (default: 0.5)
  scanIntervalMs?: number;            // Intervalo entre escaneos en ms (default: 100)
  maxResolutionWidth?: number;        // Ancho máximo de la imagen (default: 640)
}
```

### Modelos personalizados

Si tienes tus propios modelos ONNX (entrenados con el pipeline de ScanAI):

```js
const scanner = new AIScanner({
  models: {
    detectorUrl: "https://tu-cdn.com/tu-detector.onnx",
    superResolutionUrl: "https://tu-cdn.com/tu-sr.onnx",
    deblurUrl: "https://tu-cdn.com/tu-deblur.onnx",
    perspectiveUrl: "https://tu-cdn.com/tu-perspective.onnx",
    autofocusUrl: "https://tu-cdn.com/tu-autofocus.onnx",
  },
});
```

### Carga de modelos desde ArrayBuffer

```js
const detectorBytes = await fetch("/models/detector.onnx")
  .then(r => r.arrayBuffer());

const scanner = new AIScanner();
await scanner.loadModelsFromBytes({
  detectorBytes: new Uint8Array(detectorBytes),
});
```

---

## Mejores prácticas

1. **Siempre llamar a `destroy()`** al desmontar el componente para liberar memoria
2. **Cachar modelos** usando localStorage (el SDK lo hace automáticamente)
3. **Ajustar `scanIntervalMs`** según la capacidad del dispositivo
4. **Usar `enableTracking: true`** para reducir consumo de batería
5. **Limitar simbologías** a las necesarias para mejor velocidad

---

## Solución de problemas

### "Models not loaded"
Asegúrate de que las URLs de modelos son accesibles y que `start()` se completó antes de escanear.

### "WASM module not initialized"
El archivo `.wasm` debe estar servido con el MIME type correcto: `application/wasm`.

### Rendimiento lento
- Reduce `maxResolutionWidth` a 480
- Desactiva modelos que no necesites
- Aumenta `scanIntervalMs` a 200-300ms
