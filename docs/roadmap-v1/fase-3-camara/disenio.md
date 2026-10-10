# Fase 3 — Diseño

## Arquitectura

```
 MAIN THREAD                                         WORKER (module)
┌────────────────────────────────┐                 ┌──────────────────────────────────┐
│ Scanner (API pública)          │   postMessage   │ WorkerHost                       │
│  ├─ Camera                     │ ──────────────► │  ├─ engine (F2)                  │
│  │   getUserMedia, torch, zoom │  frame (transf.)│  ├─ ROI crop                      │
│  ├─ FrameSource                │                 │  ├─ decode(strategy por track)   │
│  │   TrackProcessor | rVFC     │ ◄────────────── │  ├─ Fusion (consenso, dedup)     │
│  ├─ Scheduler (back-pressure)  │   results/stats │  └─ Tracker (IoU, trackId)       │
│  └─ EventEmitter               │                 └──────────────────────────────────┘
└────────────────────────────────┘
```

Ruta 1: si `MediaStreamTrackProcessor` existe (main thread o worker), su `readable` se transfiere al worker y el main thread no toca frames. Antes de elegir la ruta se comprueba que `ReadableStream` sea transferible (`structuredClone` de prueba con transfer); si no, ruta 2.

## Protocolo main ↔ worker

```ts
type ToWorker =
  | { t: "init"; wasmModule?: WebAssembly.Module; wasmUrl?: string; options: ScannerWorkerOptions }
  | { t: "stream"; readable: ReadableStream<VideoFrame> }            // ruta 1 (transferido)
  | { t: "frame"; id: number; bitmap: ImageBitmap; ts: number;     // ruta 2 (transferido)
      srcWidth: number; srcHeight: number;                          // tamaño del vídeo original
      scale: number }                                               // bitmap.width / srcWidth
  | { t: "source"; srcWidth: number; srcHeight: number }             // ruta 1 y cambios de dimensiones/rotación
  | { t: "config"; options: Partial<ScannerWorkerOptions> }
  | { t: "pause" } | { t: "resume" } | { t: "close" };

type FromWorker =
  | { t: "ready" }
  | { t: "done"; id: number; ms: number }                            // libera back-pressure
  | { t: "candidate"; result: TrackedResult }
  | { t: "detect"; result: TrackedResult }
  | { t: "lost"; trackId: number }
  | { t: "error"; code: ScanErrorCode; message: string };
```

## Scheduler

```
inFlight = false
onFrameAvailable(frame):
  if paused or inFlight or (now - lastSent) < minIntervalMs: frame.close(); return
  inFlight = true; send(frame)
onDone(ms):
  inFlight = false
  ema = 0.8*ema + 0.2*ms
  minIntervalMs = clamp(ema * 1.2, 1000/maxFps, 1000/minFps)
```
`maxFps` default 15, `minFps` 4. Con `document.hidden` se pausa; al volver se reanuda.

## Fusión

```ts
interface FusionOptions {
  confirmFrames: number | "auto";   // auto = regla de ADR-05: 2 para Code39, Code93, Codabar, ITF y Code128 < 6 caracteres; 1 para el resto
  windowMs: number;                 // 1500
  duplicateCooldownMs: number;      // 2000; Infinity = emitir una sola vez por sesión
}
```
- Clave de votación: `format + ":" + bytes` codificados como string latin1 (sin hash: los payloads son pequeños y así no hay async ni colisiones).
- Una lectura que contradice a otra en el mismo `trackId` dentro de la ventana reinicia el voto (evita emitir lecturas inestables).

## Tracker

- **Caja de seguimiento** por resultado: en 2D, la caja de las 4 esquinas; en 1D (posición degenerada = línea), se expande perpendicularmente a la línea una altura de `0,3 × longitud` para obtener un rectángulo orientado.
- Asociación greedy en dos criterios: IoU ≥ 0,3 **o** (distancia entre centros < 0,5 × diagonal de la caja anterior **y** mismo `format`). El mismo payload en otra posición con IoU 0 es otro track (dos productos iguales en el frame).
- Si el resultado no trae posición útil (caja de área 0 incluso tras expandir), se asocia solo por payload.
- `trackId` incremental; un track muere tras `lostAfterMs` (500 ms) sin aparecer → evento `lost`.
- Tipos de track: `read` (tiene lectura válida) y `unread` (solo posición, viene de `returnErrors` o de un plugin).
- Coordenadas: el worker trabaja en el espacio del frame procesado y multiplica por `1/scale` antes de emitir, de modo que los resultados siempre están en píxeles de `srcWidth × srcHeight`. En ruta 2 el worker conoce `srcWidth/srcHeight` y reescala las coordenadas, pero solo dispone del detalle de imagen del frame reducido (relevante para el warp de F5).
- Por track: contador de fallos → sube estrategia (`balanced` → `thorough`) solo en la ROI del track expandida 20 %.
- Presupuesto por frame: como máximo 1 ROI `thorough` + el barrido rotativo, para no romper el FPS objetivo; el resto se pospone al siguiente frame (cola por prioridad: `unread` de ZXing → ROIs de plugin → barrido).

## Barrido rotativo

```
zonas = [centro 60%, TL, TR, BL, BR (2×2 con 20% de solape)]
si framesSinNada >= escalateAfterFrames (default 3): procesar además zonas[i % zonas.length] con thorough; i++
```

## Cámara

```ts
const stream = await navigator.mediaDevices.getUserMedia({
  audio: false,
  video: {
    deviceId: savedId ? { exact: savedId } : undefined,
    facingMode: savedId ? undefined : { ideal: "environment" },
    width: { ideal: 1280 }, height: { ideal: 720 },
    frameRate: { ideal: 30 },
  },
});
// Heurística de cámara principal (tras el primer permiso, cuando las etiquetas ya son visibles):
//   traseras = enumerateDevices().filter(kind==='videoinput' && /back|rear|environment|trasera/i)
//   puntuar por capabilities: +2 focusMode incluye 'continuous', +1 torch, +1 zoom.max > 1
//   descartar solo /ultra[\s-]*wide|0[.,]5\s*x?/i (NO "Dual Wide"/"Triple": son la principal en iOS)
//   si cambia de cámara, re-abrir el stream con deviceId exact
const caps = track.getCapabilities?.() ?? {};
// torch:  caps.torch      → track.applyConstraints({ advanced: [{ torch: on }] })
// zoom:   caps.zoom       → { min, max, step }
// focus:  caps.focusMode?.includes("continuous")
```
- Errores `NotAllowedError` → `PERMISSION_DENIED`; `NotFoundError`/`OverconstrainedError` → `NO_CAMERA` (con reintento sin `deviceId`); `NotReadableError` → `CAMERA_IN_USE`; `!isSecureContext` → `INSECURE_CONTEXT`.
- iOS Safari: `<video playsinline muted autoplay>` obligatorio; documentado y aplicado por el SDK cuando crea el `<video>`.

## API (borrador; se congela en F4)

```ts
const scanner = createScanner({
  video?: HTMLVideoElement,          // si no, se crea uno oculto
  formats?: BarcodeFormat[],
  roi?: { x: number; y: number; width: number; height: number } | "full", // normalizado 0..1
  strategy?: "fast" | "balanced" | "thorough",
  fusion?: Partial<FusionOptions>,
  camera?: { deviceId?: string; resolution?: [number, number]; facingMode?: "environment" | "user"; rememberCamera?: boolean },
  processingWidth?: number | "native", // ancho al que se reduce cada frame antes de procesar; default 1280
  worker?: boolean,                  // default true
  maxFps?: number,
  escalateAfterFrames?: number,      // default 3 (barrido rotativo y plugins)
  stream?: MediaStream,              // stream externo: el SDK no lo detiene en stop() salvo { ownStream: true }
  workerFactory?: () => Worker,      // F4/F5
});
scanner.on("detect", (r) => …);
await scanner.start({ signal });    // signal opcional
await scanner.setTorch(true);
await scanner.setZoom(2);
scanner.pause(); scanner.resume(); await scanner.stop(); scanner.destroy();
```
