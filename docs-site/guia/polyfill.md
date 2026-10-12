# Polyfill de `BarcodeDetector`

```ts
import { installPolyfill } from "@qhago/scanner/polyfill";

installPolyfill(); // solo si el navegador no trae BarcodeDetector ({ force: true } para sustituirlo siempre)
const detector = new BarcodeDetector({ formats: ["qr_code", "ean_13"] });
const codes = await detector.detect(imageBitmap); // [{ rawValue, format, boundingBox, cornerPoints }]
```

Sigue la [especificación](https://wicg.github.io/shape-detection-api/#barcode-detection-api): nombres de formato
de la spec, `rawValue` y `TypeError` para `formats` vacío o no soportado, como el nativo. También se puede usar `BarcodeDetectorPolyfill` directamente sin
tocar `globalThis`.

¿Nativo o motor WASM? `decode(input, { engine: "auto" })` usa el `BarcodeDetector` nativo cuando existe y cubre los
formatos pedidos, y el motor WASM en el resto; el default es `"wasm"` (resultados idénticos en todas las plataformas).
