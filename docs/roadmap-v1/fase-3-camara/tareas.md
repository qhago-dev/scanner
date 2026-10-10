# Fase 3 — Tareas

## F3.1 — Camera
**Esfuerzo**: 1 d · **Archivos**: `packages/scanner/src/camera/`
- [ ] `getUserMedia` con constraints del diseño y reintentos
- [ ] `listCameras()`, `switchCamera()`, persistencia opcional de `deviceId` (localStorage, clave namespaced)
- [ ] Heurística de cámara principal por capabilities (regex solo para "Ultra Wide"/"0,5×")
- [ ] Aceptar `MediaStream` o `<video>` externo (sin detener tracks ajenos salvo `ownStream`)
- [ ] `getPermissionState()`
- [ ] `setTorch()`, `setZoom()`, `getCapabilities()` normalizado
- [ ] Mapeo de errores a `ScanErrorCode`
- [ ] Atributos iOS (`playsinline`, `muted`)

## F3.2 — FrameSource (3 rutas)
**Esfuerzo**: 1 d · **Archivos**: `packages/scanner/src/frames/`
- [ ] Ruta 1 `MediaStreamTrackProcessor` (transfer del readable al worker, con detección de transferibilidad)
- [ ] Ruta 2 `requestVideoFrameCallback` + `createImageBitmap` con `resizeWidth` transferido; detectar si el resize se aplicó (`bitmap.width`) y si no, reducir en el worker (validar en Safari)
- [ ] Ruta 3 intervalo + canvas
- [ ] Detección de capacidades y selección automática; override por opción

## F3.3 — Worker host y protocolo
**Esfuerzo**: 1 d · **Archivos**: `packages/scanner/src/worker/`
- [ ] Mensajes tipados del diseño
- [ ] Paso del `WebAssembly.Module` compilado al worker (sin recompilar)
- [ ] `new Worker(new URL("./worker.js", import.meta.url), { type: "module" })` + override `workerUrl`
- [ ] Worker cross-origin (CDN): bootstrap desde `Blob` que importa la URL remota (ADR-06)
- [ ] Modo `worker: false` con la misma interfaz

## F3.4 — Scheduler con back-pressure y ritmo adaptativo
**Esfuerzo**: 4h · **Archivos**: `packages/scanner/src/scheduler.ts`
- [ ] 1 frame en vuelo; descarte con `frame.close()`; nunca más de 2 frames retenidos (test que cuenta `VideoFrame`/`ImageBitmap` abiertos)
- [ ] Ajuste opcional por batería (`navigator.getBattery` si existe: < 20 % → `maxFps` a la mitad)
- [ ] EMA y límites `minFps`/`maxFps`
- [ ] Pausa con `visibilitychange`

## F3.5 — ROI
**Esfuerzo**: 3h
- [ ] Recorte en worker (sobre plano Y del VideoFrame cuando sea posible)
- [ ] ROI normalizada; coordenadas de resultados en píxeles del vídeo original
- [ ] Mensajes `frame` con `srcWidth/srcHeight/scale` y `source`; reescalado de coordenadas en worker
- [ ] Manejo de rotación del dispositivo / cambio de dimensiones del stream

## F3.6 — Tracker
**Esfuerzo**: 1 d · **Archivos**: `packages/scanner/src/tracker.ts`
- [ ] Caja de seguimiento 1D expandida; asociación IoU o centro+formato; `trackId`, expiración, evento `lost`
- [ ] Tracks `unread` desde `returnErrors` (nunca emitidos como `detect`)
- [ ] Escalado de estrategia por track con presupuesto por frame
- [ ] Barrido rotativo tras `escalateAfterFrames` frames sin nada
- [ ] Tests unitarios con secuencias sintéticas de cajas

## F3.7 — Fusión
**Esfuerzo**: 1 d · **Archivos**: `packages/scanner/src/fusion.ts`
- [ ] Votación, ventana, `confirmFrames: "auto"` (regla de ADR-05), reinicio por contradicción
- [ ] Deduplicación con cooldown
- [ ] Eventos `candidate` y `detect`
- [ ] Ajustar defaults con `bench` vídeos split `dev`

## F3.8 — Scanner (API) y ciclo de vida
**Esfuerzo**: 1 d · **Archivos**: `packages/scanner/src/scanner.ts`
- [ ] `createScanner`, eventos tipados, estados
- [ ] `start/pause/resume/stop/destroy` idempotentes; test de fugas
- [ ] Stats opcionales (`frame` event)

## F3.9 — Demo y pruebas en dispositivos
**Esfuerzo**: 1 d · **Archivos**: `apps/demo/`, `docs/roadmap-v1/fase-3-camara/pruebas-dispositivos.md`
- [ ] Demo con selector de cámara, linterna, zoom, ROI, stats
- [ ] Desplegar demo (GitHub Pages / Vercel) para probar con HTTPS en móviles
- [ ] Matriz manual según "Plataformas soportadas", incluidos ≥ 2 Android con varias cámaras traseras

## F3.10 — Gate G3
**Esfuerzo**: 3h
- [ ] Correr bench de vídeo; registrar resultados
- [ ] Publicar la siguiente `0.x.y-alpha.N` (dist-tag `alpha`)
- [ ] Medición manual en `android-mid` (main thread y memoria 30 min) registrada
