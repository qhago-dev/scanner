# Fase 3 — Tareas

## F3.1 — Camera
**Esfuerzo**: 1 d · **Archivos**: `packages/scanner/src/camera/`
- [x] `getUserMedia` con constraints del diseño y reintentos
- [x] `listCameras()`, `switchCamera()`, persistencia opcional de `deviceId` (localStorage, clave namespaced)
- [x] Heurística de cámara principal por capabilities (regex solo para "Ultra Wide"/"0,5×")
- [x] Aceptar `MediaStream` o `<video>` externo (sin detener tracks ajenos salvo `ownStream`)
- [x] `getPermissionState()`
- [x] `setTorch()`, `setZoom()`, `getCapabilities()` normalizado
- [x] Mapeo de errores a `ScanErrorCode`
- [x] Atributos iOS (`playsinline`, `muted`)

## F3.2 — FrameSource (3 rutas)
**Esfuerzo**: 1 d · **Archivos**: `packages/scanner/src/frames/`
- [x] Ruta 1 `MediaStreamTrackProcessor` (transfer del readable al worker, con detección de transferibilidad)
- [x] Ruta 2 `requestVideoFrameCallback` + `createImageBitmap` con `resizeWidth` transferido; detectar si el resize se aplicó (`bitmap.width`) y si no, reducir en el worker (validar en Safari)
- [x] Ruta 3 intervalo + canvas
- [x] Detección de capacidades y selección automática; override por opción

## F3.3 — Worker host y protocolo
**Esfuerzo**: 1 d · **Archivos**: `packages/scanner/src/worker/`
- [x] Mensajes tipados del diseño
- [x] Paso del `WebAssembly.Module` compilado al worker (sin recompilar)
- [x] `new Worker(new URL("./worker.js", import.meta.url), { type: "module" })` + override `workerUrl`
- [x] Worker cross-origin (CDN): bootstrap desde `Blob` que importa la URL remota (ADR-06)
- [x] Modo `worker: false` con la misma interfaz

## F3.4 — Scheduler con back-pressure y ritmo adaptativo
**Esfuerzo**: 4h · **Archivos**: `packages/scanner/src/scheduler.ts`
- [x] 1 frame en vuelo; descarte con `frame.close()`; nunca más de 2 frames retenidos (test que cuenta `VideoFrame`/`ImageBitmap` abiertos)
- [x] Ajuste opcional por batería (`navigator.getBattery` si existe: < 20 % → `maxFps` a la mitad)
- [x] EMA y límites `minFps`/`maxFps`
- [x] Pausa con `visibilitychange`

## F3.5 — ROI
**Esfuerzo**: 3h
- [x] Recorte en worker (sobre plano Y del VideoFrame cuando sea posible)
- [x] ROI normalizada; coordenadas de resultados en píxeles del vídeo original
- [x] Mensajes `frame` con `srcWidth/srcHeight/scale` y `source`; reescalado de coordenadas en worker
- [x] Manejo de rotación del dispositivo / cambio de dimensiones del stream

## F3.6 — Tracker
**Esfuerzo**: 1 d · **Archivos**: `packages/scanner/src/tracker.ts`
- [x] Caja de seguimiento 1D expandida; asociación IoU o centro+formato; `trackId`, expiración, evento `lost`
- [x] Tracks `unread` desde `returnErrors` (nunca emitidos como `detect`)
- [x] Escalado de estrategia por track con presupuesto por frame
- [x] Barrido rotativo tras `escalateAfterFrames` frames sin nada
- [x] Tests unitarios con secuencias sintéticas de cajas

## F3.7 — Fusión
**Esfuerzo**: 1 d · **Archivos**: `packages/scanner/src/fusion.ts`
- [x] Votación, ventana, `confirmFrames: "auto"` (regla de ADR-05), reinicio por contradicción
- [x] Deduplicación con cooldown
- [x] Eventos `candidate` y `detect`
- [x] Ajustar defaults con `bench` vídeos split `dev`

## F3.8 — Scanner (API) y ciclo de vida
**Esfuerzo**: 1 d · **Archivos**: `packages/scanner/src/scanner.ts`
- [x] `createScanner`, eventos tipados, estados
- [x] `start/pause/resume/stop/destroy` idempotentes; test de fugas
- [x] Stats opcionales (`frame` event)

## F3.9 — Demo y pruebas en dispositivos
**Esfuerzo**: 1 d · **Archivos**: `apps/demo/`, `docs/roadmap-v1/fase-3-camara/pruebas-dispositivos.md`
- [x] Demo con selector de cámara, linterna, zoom, ROI, stats
- [ ] Desplegar demo (GitHub Pages / Vercel) para probar con HTTPS en móviles
- [ ] Matriz manual según "Plataformas soportadas", incluidos ≥ 2 Android con varias cámaras traseras

## F3.10 — Gate G3
**Esfuerzo**: 3h
- [x] Correr bench de vídeo; registrar resultados
- [ ] Publicar la siguiente `0.x.y-alpha.N` (dist-tag `alpha`)
- [ ] Medición manual en `android-mid` (main thread y memoria 30 min) registrada

## Estado (2026-10-10)

Implementada y probada con cámara simulada en Chromium (8 tests: las 3 rutas detectan, dedup, ciclo de vida, stream externo, ROI, stats). Pendiente: matriz manual en dispositivos (autor), despliegue HTTPS de la demo, medición en `android-mid` y G3 con vídeos reales.

Decisiones tomadas al implementar:
- **Worker unificado** (`src/worker/host.ts`): decode() y sesiones en el mismo host; se exporta como `@qhago/scanner/worker-host` (base para F5). Cada scanner tiene su propio worker y lo termina en `destroy()`.
- **Evento `track`** (nuevo): posición de códigos ya confirmados en cada frame (la fusión suprime duplicados y el overlay se quedaba sin posiciones). Lo usa el componente de F4.
- **`strategy: "fast"` por defecto en vídeo**: muchas oportunidades por segundo; los difíciles los cubren el escalado `thorough` de tracks `unread` y el barrido rotativo.
- `maxCodes` 4 por defecto.
- Benchmark de vídeo en tiempo real simulado (`bench/runners/video.ts`, frames descartados si el motor está ocupado). Sintético/dev (58 clips, no real): qhago 81,1 % leídos, ttfr p50 935 ms; zxing-wasm frame a frame 75,5 %, 1 149 ms; Δ +5,7 pp [0,0, 13,2] → "no peor". qhago descarta más frames por el coste del escalado cuando no hay nada: candidato a ajuste con datos reales.
