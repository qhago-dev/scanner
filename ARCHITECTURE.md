# ScanAI SDK — Arquitectura Técnica

## Pipeline de procesamiento

```
┌─────────────────────────────────────────────────────────────────┐
│                        CAMERA FRAME                             │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. AUTOFOCUS CLASSIFIER (ONNX, INT8, ~0.5ms)                   │
│     MobileNetV3-Small → probabilidad [0,1]                      │
│     Si < 0.3 → skip frame (desenfocado)                         │
└─────────────────────┬───────────────────────────────────────────┘
                      │ (si enfocado)
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. DETECTION (NanoDet ONNX, INT8, <5ms target)                 │
│     320×320 input → [bboxes, scores, classes]                   │
│     Clases: barcode_1d, qr_code, datamatrix, pdf417             │
│     NMS con IoU threshold 0.45                                  │
│     Si no hay detecciones → skip frame                          │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. ROI EXTRACTION                                               │
│     Crop + normalize tamaño mínimo 64×64                        │
│     Si ROI < 128px en cualquier dimensión → activar SR          │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. SUPER-RESOLUTION (condicional, ESRGAN Tiny ONNX, ~2ms)     │
│     64×64 → 128×128 (2× upscale)                                │
│     Solo si ROI < 128px                                         │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. DEBLUR (condicional, UNet ONNX, ~1.5ms)                    │
│     Estima blur kernel → deconvolve                             │
│     Solo si laplacian variance < threshold                      │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. PERSPECTIVE CORRECTION                                       │
│     Detecta 4 esquinas → warp perspective → imagen frontal      │
│     Tamaño output: 256×256 normalizado                          │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  7. DECODE (ZXing-C++ Wasm, ~3ms)                               │
│     Intenta simbologías configuradas en orden de prioridad      │
│     Retorna: { text, format, corners, timestamp }               │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  8. TRACKING (Algoritmo propio)                                  │
│     Compara resultado con anterior:                             │
│       - Mismo código → emitir "tracking", saltar pipeline      │
│       - Código diferente → emitir "decode", pipeline completo   │
│       - Sin código → emitir "lost", pipeline completo           │
└─────────────────────────────────────────────────────────────────┘
```

## Componentes del núcleo Rust

```
core/src/
├── lib.rs                 # Punto de entrada, re-exports
├── types.rs               # Structs: BarcodeResult, ScanConfig, Symbology
├── onnx_runner.rs         # Wrapper thread-safe sobre ONNX Runtime
├── pipeline.rs            # Orquestación del pipeline completo
├── detection.rs           # NanoDet inference + NMS postprocessing
├── super_resolution.rs    # ESRGAN Tiny inference
├── deblur.rs              # UNet deblur inference
├── perspective.rs         # Corner detection + warp affine
├── decoding.rs            # ZXing-C++ Wasm wrapper
├── tracking.rs            # Algoritmo de tracking adaptativo
├── autofocus.rs           # Clasificador binario enfoque
└── wasm_bindings.rs       # #[wasm_bindgen] exports para JS
```

## Flujo de datos

### Entrada
- `AIScannerConfig`: simbologías, resolución, frecuencia de escaneo, modelos ONNX (URLs o ArrayBuffers)

### PipelineState (interno)
```rust
struct PipelineState {
    last_result: Option<BarcodeResult>,
    last_roi: Option<Rect>,
    last_roi_histogram: Option<Vec<f32>>,
    last_decode_time: Instant,
    tracking_mode: bool,
    frame_count: u64,
}
```

### Salida (eventos)
```typescript
type ScanEvent =
  | { type: "decode"; data: BarcodeResult }
  | { type: "tracking"; data: BarcodeResult }  // mismo código, tracking
  | { type: "lost" }                            // código perdido
  | { type: "focus"; focused: boolean }
  | { type: "error"; message: string };
```

## Modelos ONNX

| Modelo | Archivo | Input | Output | Tamaño | Framework |
|--------|---------|-------|--------|--------|-----------|
| Detector | `nanodet_barcode.onnx` | 1×3×320×320 | boxes, scores, classes | ~3.5 MB | NanoDet |
| Super-Res | `esrgan_tiny.onnx` | 1×3×64×64 | 1×3×128×128 | ~0.8 MB | ESRGAN |
| Deblur | `deblur_unet.onnx` | 1×3×128×128 | 1×3×128×128 | ~1.2 MB | UNet |
| Perspectiva | `perspective_corners.onnx` | 1×3×128×128 | 1×8 (4 corners) | ~2.0 MB | MobileNetV3 |
| Autofocus | `autofocus.onnx` | 1×3×128×128 | 1×1 (score) | ~1.5 MB | MobileNetV3 |

## Estrategia de tracking adaptativo

```
ALGORITMO: AdaptiveScanTracking

STATE:
  last_roi: Rect | null
  last_histogram: number[]
  last_decode: BarcodeResult | null
  consecutive_empty_frames: number

ON_NEW_FRAME(frame):
  IF last_roi IS NOT null:
    roi_crop = crop(frame, last_roi.expand(20%))
    hist_diff = histogram_distance(roi_crop, last_histogram)

    IF hist_diff < 0.15 AND consecutive_empty_frames < 10:
      // Modo tracking: solo decodificar ROI actual
      result = zxing_decode(roi_crop)
      IF result == last_decode.text:
        emit("tracking", result)
        RETURN
      ELIF result IS NOT null:
        emit("decode", result)
        last_decode = result
        RETURN

    consecutive_empty_frames += 1
    IF consecutive_empty_frames > 10:
      // Perdimos el tracking, volver a detección completa
      last_roi = null
      consecutive_empty_frames = 0

  // Pipeline completo
  result = full_pipeline(frame)
  IF result:
    last_roi = result.roi
    last_histogram = compute_histogram(result.roi)
    last_decode = result
    consecutive_empty_frames = 0
    emit("decode", result)
  ELSE:
    emit("lost")
```

## Binding Wasm → JS

```rust
#[wasm_bindgen]
pub struct AIScanner { ... }

#[wasm_bindgen]
impl AIScanner {
    #[wasm_bindgen(constructor)]
    pub fn new(config: JsValue) -> Result<AIScanner, JsValue>;

    #[wasm_bindgen]
    pub async fn start(&mut self) -> Result<(), JsValue>;

    #[wasm_bindgen]
    pub fn stop(&mut self);

    #[wasm_bindgen]
    pub fn process_frame(
        &mut self,
        data: &[u8],
        width: u32,
        height: u32,
        format: &str,
    ) -> Result<JsValue, JsValue>;

    #[wasm_bindgen]
    pub fn set_config(&mut self, config: JsValue) -> Result<(), JsValue>;

    #[wasm_bindgen]
    pub fn get_models_loaded(&self) -> bool;

    #[wasm_bindgen]
    pub async fn load_models(&mut self, model_urls: JsValue) -> Result<(), JsValue>;
}
```
