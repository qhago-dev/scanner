# Fase 2 — Diseño

## Capas

```
┌───────────────────────────── packages/scanner ─────────────────────────────┐
│ decode(input, opts)                                                         │
│   └─ toLuma(input)  ── adaptadores por tipo de entrada (browser / node)     │
│   └─ engine.read(lumaPtr, w, h, opts)                                       │
│   └─ postValidate(results)                                                  │
│                                                                             │
│ engine.ts  (carga única del WASM, buffers reutilizables, serialización)     │
└──────────────────────────────────┬─────────────────────────────────────────┘
                                   │ punteros al heap (HEAPU8), sin base64
┌──────────────────────────────────▼──────── packages/engine-wasm ───────────┐
│ qhago_engine.wasm  (Emscripten, -Oz, solo lectores)                        │
│   bridge.cpp      sa_read(luma, w, h, opts*) → n   (ABI completo abajo)     │
│   preprocess.cpp  CLAHE, unsharp, resize bicúbico, rgba→luma BT.601         │
│   cascade.cpp     estrategias fast / balanced / thorough con presupuesto    │
│   ZXing-C++ (submódulo)                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

## ABI del bridge (C)

```c
// Opciones en un struct plano (se escribe desde JS en el heap)
typedef struct {
  uint32_t formats;        // bitmask de BarcodeFormat
  uint8_t  try_harder, try_rotate, try_invert, try_downscale;
  uint8_t  binarizer;      // 0 LocalAverage, 1 GlobalHistogram, 2 FixedThreshold, 3 BoolCast
  uint8_t  is_pure, text_mode, ean_addon, return_errors;
  uint8_t  strategy;       // 0 fast, 1 balanced, 2 thorough
  uint8_t  preprocess;     // bitmask: CLAHE | UNSHARP | MULTISCALE | CROPS
  uint16_t max_symbols;
  uint16_t min_line_count;
  uint32_t time_budget_ms; // 0 = sin límite
  int32_t  region_x, region_y, region_w, region_h; // región en px; w=0 → imagen completa
} sa_options;

uint32_t sa_abi_version(void);                     // comparada por el JS al cargar (ADR-06)
uint8_t* sa_alloc_input(uint32_t bytes);           // reusa si cabe
// conversión in situ al buffer de luma interno; stride en bytes (≥ w*4)
int32_t  sa_rgba_to_luma(const uint8_t* rgba, uint32_t w, uint32_t h, uint32_t stride);
// luma: w*h bytes contiguos (stride = w; los adaptadores TS compactan si hace falta)
int32_t  sa_read(const uint8_t* luma, uint32_t w, uint32_t h, const sa_options* o);
const char* sa_result_json(void);                  // resultados de la última llamada
void     sa_free(void);
```

Antes de cerrar el ABI, F2.2 inventaría qué expone `ZXing::Barcode` en el tag fijado (posición, `orientation`, `isMirrored`, `isInverted`, `ecLevel`, `symbologyIdentifier`, `contentType`, `lineCount`, `error`); los campos de `BarcodeResult` que no existan se eliminan del tipo en lugar de inventarse.

Los resultados se serializan una vez en C++ a un JSON compacto (o, si el profiling lo justifica, a un buffer binario con offsets). Los bytes crudos van en base64 **solo dentro del JSON de resultado** (pocos bytes), nunca la imagen.

Flags de Emscripten:
```
-Oz -flto -sMODULARIZE -sEXPORT_ES6
-sENVIRONMENT=web,worker   (artefacto navegador)  |  -sENVIRONMENT=node  (artefacto node/bun)
                    # un ENVIRONMENT por artefacto: con `node` en un build ES6 el glue puede emitir
                    # top-level await (import de 'module'), que rompe require(esm) y algunos bundlers.
                    # F2.1 verifica que ningún glue contiene top-level await.
-sALLOW_MEMORY_GROWTH -sINITIAL_MEMORY=16MB -sFILESYSTEM=0 -sASSERTIONS=0
-sEXPORTED_FUNCTIONS=_sa_abi_version,_sa_alloc_input,_sa_rgba_to_luma,_sa_read,_sa_result_json,_sa_free,_malloc,_free
                    # lista explícita: Emscripten no admite comodines aquí
-sEXPORTED_RUNTIME_METHODS=HEAPU8,UTF8ToString
-sDYNAMIC_EXECUTION=0   # sin eval → CSP estricta
-fwasm-exceptions   # el bridge captura excepciones de ZXing; wasm EH nativo es más pequeño
                    # que el modo JS y lo soportan todos los navegadores de la matriz (medir en F2.1)
cmake: -DZXING_READERS=ON -DZXING_WRITERS=OFF -DZXING_EXAMPLES=OFF -DZXING_BLACKBOX_TESTS=OFF
```
Post: `wasm-opt -Oz --strip-debug`. Variante opcional con SIMD (`-msimd128`) cargada si `WebAssembly.validate` lo detecta (solo se publica si mejora ≥ 15 % la latencia; si no, una sola variante).

**Dos artefactos**: `qhago_engine.wasm` (navegador, sin decoder de imágenes) y `qhago_engine.wasm (build node)` (= el anterior + `stb_image` para PNG/JPEG). Así el navegador no paga el decoder, que ya tiene nativo (`createImageBitmap`). El entry `node`/`bun` del paquete carga el segundo.

## Cascada de estrategias

| Estrategia | Pasos (se detiene al primer éxito válido) |
|---|---|
| `fast` | luma → ReadBarcodes(tryHarder=false, downscale=true) |
| `balanced` (default) | fast → tryHarder+rotate+invert → CLAHE |
| `thorough` | balanced → unsharp → multiescala 0,5×/2× → 5 recortes solapados |

Cada paso consulta `time_budget_ms`. Las estrategias se ajustan con el split `dev` de F1.

## Tipos públicos (borrador; se congelan en F4)

```ts
export type BarcodeFormat =                                     // los 13 de 1.0; nombres = BarcodeDetector
  | "aztec" | "codabar" | "code_39" | "code_93" | "code_128" | "data_matrix"
  | "ean_8" | "ean_13" | "itf" | "pdf417" | "qr_code" | "upc_a" | "upc_e";

export interface BarcodeResult {
  format: BarcodeFormat;
  text: string;
  bytes: Uint8Array;
  cornerPoints: [Point, Point, Point, Point];
  boundingBox: { x: number; y: number; width: number; height: number };
  orientation: number;           // grados
  isMirrored: boolean;
  isInverted: boolean;
  contentType: "text" | "binary" | "gs1" | "iso15434" | "mixed" | "unknown";
  symbologyIdentifier: string;   // ]E0, ]Q1…
  ecLevel?: string;
  confidence: number;            // 0..1 derivada
}

export interface DecodeOptions {
  formats?: BarcodeFormat[];
  strategy?: "fast" | "balanced" | "thorough";
  maxSymbols?: number;
  timeBudgetMs?: number;
  validateChecksums?: boolean | "strict"; // true (default): checksums obligatorios de cada formato + filtros de longitud;
                                          // "strict": además los opcionales (Code39 mod43, ITF dígito de control); false: ninguno extra
  includeErrors?: boolean;       // default false; si true, decode() devuelve { results, candidates }
  region?: { x: number; y: number; width: number; height: number }; // en píxeles de la imagen de entrada
  maxInputPixels?: number;       // default 16e6 (límite de canvas de iOS Safari ≈ 16,7 MP)
  worker?: boolean;              // solo main thread de navegador; default true (ADR-02)
  engine?: "wasm" | "native" | "auto"; // ADR-07; default "wasm". "native" usa BarcodeDetector (si falta → UNSUPPORTED),
                                 // "auto" usa nativo si soporta todos los formatos pedidos; en Node/Bun siempre "wasm"
  signal?: AbortSignal;
  advanced?: Partial<{ binarizer: …; tryRotate: boolean; tryInvert: boolean; … }>;
}

export interface DecodeCandidate {          // símbolo detectado pero no decodificado (returnErrors)
  format: BarcodeFormat;
  cornerPoints: [Point, Point, Point, Point];
  boundingBox: { x: number; y: number; width: number; height: number };
  error: "checksum" | "format" | "unsupported";
}

export function decode(input: ImageInput, options?: DecodeOptions & { includeErrors?: false }): Promise<BarcodeResult[]>;
export function decode(input: ImageInput, options: DecodeOptions & { includeErrors: true }):
  Promise<{ results: BarcodeResult[]; candidates: DecodeCandidate[] }>;
export function configure(config: { wasmUrl?: string | URL; wasmModule?: WebAssembly.Module;
                                    workerUrl?: string | URL; workerFactory?: () => Worker }): void;
export function init(config?: Parameters<typeof configure>[0] & { signal?: AbortSignal }): Promise<void>; // precarga; fusiona con configure()
```

## Adaptadores de entrada

| Entrada | Navegador / Worker | Node / Bun |
|---|---|---|
| `ImageData` | directo (RGBA → luma en WASM) | directo |
| `ImageBitmap`, `VideoFrame`, `HTMLImageElement`, canvas | `OffscreenCanvas` reutilizable → `getImageData` | n/a |
| `VideoFrame` con `format` NV12/I420/I420A | `copyTo()` solo del plano Y respetando `visibleRect` y `layout` (stride) = luma sin conversión | n/a |
| `VideoFrame` con `format` RGBA/BGRA/RGBX/BGRX o `null` | dibujar en `OffscreenCanvas` → `getImageData` (canal B/R según formato) | n/a |
| `Blob`/`File` | `createImageBitmap(blob, { imageOrientation: "from-image" })` (respeta EXIF) | n/a |
| `Buffer`/`Uint8Array` codificado | `createImageBitmap(new Blob([buf]))` | `qhago_engine.wasm (build node)` (stb_image, PNG/JPEG; EXIF ignorado, lo compensa `tryRotate`) |
| `{ data, width, height, format: "luma" \| "rgba" }` | directo | directo |

Leer el plano Y de `VideoFrame` evita la conversión de color y el canvas: es la ruta preferida en F3.

## Carga del WASM

```ts
const url = config.wasmUrl ?? new URL("./qhago_engine.wasm", import.meta.url);
// Con ALLOW_MEMORY_GROWTH las vistas sobre memory.buffer (HEAPU8) se invalidan al crecer:
// el engine NUNCA cachea vistas entre llamadas; obtiene Module.HEAPU8 justo antes de cada escritura/lectura.
// navegador: WebAssembly.compileStreaming(fetch(url)) con fallback a arrayBuffer
// node/bun:  fs.readFile(fileURLToPath(url))
// el Module compilado se cachea y se puede enviar al worker por postMessage (se clona, no se transfiere; la compilación no se repite)
```

## Validación post-lectura

- EAN/UPC: ZXing ya valida; se conserva.
- ITF: longitud par + dígito de control opcional.
- Code39: mod43 solo con `validateChecksums: "strict"` (muchos Code39 reales no lo llevan).
- ITF: dígito de control solo con `"strict"`; longitud par siempre.
- Filtro de longitud mínima por formato (Codabar/ITF ≥ 6) para reducir falsos positivos.
- `confidence` (heurística, documentada como tal, 0..1):
  - 1D: `min(1, lineCount / 4)` si ZXing expone `lineCount`; si no, 1 para formatos con checksum fuerte y 0,5 para el resto.
  - 2D: 1 (la corrección Reed-Solomon ya garantiza integridad; ZXing no expone el número de errores corregidos).
  - En el scanner (F3), la confianza final sube con el consenso multi-frame.
  - No se usa para filtrar por defecto; existe para que la UI pueda decidir.
