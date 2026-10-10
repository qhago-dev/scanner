# Fase 4 — Diseño

## Entry points del paquete

| Import | Contenido | Presupuesto gzip (JS) |
|---|---|---|
| `@qhago/scanner` | `decode`, `init`, `configure`, `createScanner`, `mapToElement`, `getEnvironmentReport`, tipos, `ScanError` | ≤ 15 KB |
| `@qhago/scanner/worker-host` | host del worker para componer workers de plugins (F5) | (interno del worker) |
| `@qhago/scanner/polyfill` | `BarcodeDetectorPolyfill`, `installPolyfill` | ≤ 3 KB (+ core) |
| `@qhago/scanner/quagga-compat` | API estilo Quagga2 | ≤ 3 KB (+ core) |
| `@qhago/scanner/ui` | Custom Element `<qhago-scanner>` | ≤ 8 KB (+ core) |
| `@qhago/scanner/parsers` | `parseGS1`, `parseQRContent`, `parseAAMVA`, `parseISO15434` | ≤ 6 KB |
| `@qhago/scanner/wasm/*` | binarios para self-hosting | WASM ≤ 450 KB |

## Polyfill

```ts
export class BarcodeDetectorPolyfill {
  static getSupportedFormats(): Promise<BarcodeFormat[]>;
  constructor(options?: { formats?: BarcodeFormat[] });
  detect(image: ImageBitmapSource): Promise<DetectedBarcode[]>;
}
interface DetectedBarcode {               // forma de la spec
  boundingBox: DOMRectReadOnly;
  cornerPoints: { x: number; y: number }[];
  format: BarcodeFormat;
  rawValue: string;
}
export function installPolyfill(opts?: { force?: boolean }): void;
```
`detect()` usa `decode()` con `strategy: "balanced"`; los formatos no reconocidos lanzan `TypeError` como la spec. Sin `formats`, el polyfill detecta **todos** los formatos (como la spec), no los defaults reducidos de ADR-05. Fuentes `HTMLVideoElement`/`SVGImageElement` se rasterizan con un canvas reutilizable.

## Quagga-compat

| Quagga2 | ScanAI |
|---|---|
| `code_128_reader` | `code_128` |
| `ean_reader` / `ean_8_reader` | `ean_13` / `ean_8` |
| `upc_reader` / `upc_e_reader` | `upc_a` / `upc_e` |
| `code_39_reader`, `code_39_vin_reader` | `code_39` (+ validación VIN en compat) |
| `codabar_reader` | `codabar` |
| `i2of5_reader`, `2of5_reader` | `itf` (`2of5` industrial: no soportado → warning) |
| `code_93_reader` | `code_93` |
| `inputStream.target` | `video` / contenedor |
| `locator.halfSample`, `patchSize` | ignorados (warning una vez) |
| `numOfWorkers` | `worker: n > 0` |

Resultado emitido: `{ codeResult: { code, format, startInfo, decodedCodes: [] }, box, boxes, line }` con los campos que Quagga2 documenta; los que no aplican van vacíos.
- `box` = 4 esquinas del resultado; `boxes` = cajas de todos los resultados y tracks `unread` del frame; `line` = segmento central del código (1D: la línea de lectura de ZXing).
- `onProcessed(cb)` se llama en cada frame procesado (con o sin lectura) con ese objeto o `undefined`.
- `Quagga.canvas.ctx.overlay`/`dom.overlay`: canvas superpuesto creado por compat sobre el `<video>`; `Quagga.ImageDebug.drawPath(path, def, ctx, style)` implementado (dibuja polilíneas `{x,y}` o `[x,y]`).

## `<qhago-scanner>`

```html
<qhago-scanner formats="ean_13,qr_code" roi="0.1,0.3,0.8,0.4" torch-button switch-camera-button beep vibrate>
</qhago-scanner>
<script type="module">
  // ruta directa a dist/ (no /+esm: re-empaqueta y rompe import.meta.url, ADR-06)
  import "https://cdn.jsdelivr.net/npm/@qhago/scanner@1/dist/browser/ui.js";
  document.querySelector("qhago-scanner").addEventListener("detect", (e) => console.log(e.detail));
</script>
```
- Shadow DOM; partes (`::part(frame)`, `::part(button)`) y variables `--qhago-accent`, `--qhago-mask`.
- El overlay dibuja en un `<canvas>` superpuesto, usando `mapToElement()` para pasar de coordenadas del vídeo a CSS, interpolando las esquinas por `trackId` (animación suave). Se redimensiona con `ResizeObserver`.
- Atributo `roi` en coordenadas normalizadas 0..1 (igual que F3).
- El custom element se registra al importar `@qhago/scanner/ui` solo si `customElements` existe (SSR-safe) y si el nombre no está ya registrado.
- `aria-live="polite"` con el texto leído; botones con `aria-label` traducible (`labels` prop, defaults en es/en).

## Parsers

```ts
parseGS1("(01)07501031311309(17)261231(10)LOTE1") →
  { gtin: "07501031311309", expiry: "2026-12-31", batch: "LOTE1", ais: { "01": …, "17": …, "10": … } }
parseQRContent("WIFI:T:WPA;S:Casa;P:clave;;") → { type: "wifi", ssid: "Casa", password: "clave", security: "WPA" }
```
- GS1 acepta FNC1 (`\x1d`), paréntesis y `]C1`/`]d2`/`]Q3`.
- Tabla de AIs generada desde el GS1 Barcode Syntax Dictionary (verificar su licencia antes de incluirlo; si no es compatible, tabla escrita a mano desde la especificación pública). Script en `scripts/gen-gs1-ais.ts`.

## Configuración (fuente única)

| Opción | `configure()` / `init()` | `decode()` | `createScanner()` |
|---|---|---|---|
| `wasmUrl`, `wasmModule` | ✔ (global) | — | — |
| `workerUrl` | ✔ (global) | — | — |
| `workerFactory` | ✔ (default global) | ✔ (por llamada) | ✔ (por instancia) |
| `plugins` | — | ✔ | ✔ |
| `formats`, `strategy`, `validateChecksums` | — | ✔ | ✔ |
| `region` (px) / `roi` (normalizado) | — | `region` | `roi` |
| `worker` | — | ✔ (main thread) | ✔ |
| `engine` (`wasm`/`native`/`auto`) | — | ✔ | ✔ |
| `signal` | `init` ✔ | ✔ | `start()` ✔ |
| Cámara, fusión, `maxFps`, `escalateAfterFrames`, `processingWidth`, `stream` | — | — | ✔ |

## Errores

```ts
export class ScanError extends Error {
  code: "PERMISSION_DENIED" | "NO_CAMERA" | "CAMERA_IN_USE" | "INSECURE_CONTEXT"
      | "UNSUPPORTED" | "ENGINE_LOAD_FAILED" | "INVALID_INPUT" | "ABORTED";
  docsUrl: string;
  cause?: unknown;
}
```
Todas las operaciones largas aceptan `{ signal?: AbortSignal }`.
