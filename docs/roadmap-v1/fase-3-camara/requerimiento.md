# Fase 3 — Scanner de cámara

**Esfuerzo**: 7-9 días · **Prioridad**: Bloqueante · **Depende de**: F2 · **Versión**: pre-tag `alpha`

## Problema

El `AIScanner` actual corre en el main thread, recrea el canvas en cada frame, no gestiona permisos ni errores de cámara, y no aprovecha la información temporal del vídeo (el mayor diferenciador frente a decodificar frame a frame).

## Requerimiento

Un scanner de cámara robusto, fluido y eficiente, con fusión multi-frame.

### Debe

1. **Captura**
   - `getUserMedia` con preferencia por cámara trasera, resolución objetivo configurable (default 1280×720), `focusMode: "continuous"` cuando exista.
   - Selección y cambio de cámara (`listCameras()`, `switchCamera(id)`), recordando la última elegida (desactivable con `rememberCamera: false`).
   - **Heurística de cámara principal**: en móviles con varias cámaras traseras, `facingMode: "environment"` puede elegir la ultra gran angular, que no enfoca de cerca. Tras obtener permiso se enumeran las traseras y se decide **principalmente por capabilities** (`focusMode: "continuous"`, `torch`, rango de `zoom`); la etiqueta solo descarta "Ultra Wide"/"0,5×" (las principales de iOS se llaman "Back Dual Wide Camera"/"Back Triple Camera" y no deben descartarse). Las etiquetas reales se recogen y prueban con el inventario de dispositivos de F1.8.
   - `getPermissionState()` vía `navigator.permissions.query({ name: "camera" })` cuando exista (para mostrar UI previa al prompt).
   - Linterna (`torch`) y zoom cuando `getCapabilities()` los soporte.
   - Aceptar un `MediaStream` o `<video>` externo.
2. **Procesamiento en Worker** (ADR-02)
   - Ruta 1: `MediaStreamTrackProcessor` creado en main thread (o en el worker si el navegador lo expone allí) y su `readable` **transferido** al worker → `VideoFrame` en el worker (Chromium).
   - Ruta 2: `requestVideoFrameCallback` + `createImageBitmap(video, { resizeWidth })` (ya reducido a la resolución de proceso) transferido. Si el navegador ignora o no soporta las opciones de resize (validar en Safari en F3.2), se transfiere a tamaño completo y el worker reduce.
   - Ruta 3 (fallback): `setInterval` + canvas en main thread.
   - **Back-pressure**: nunca más de 1 frame en vuelo; se descartan los intermedios.
3. **Región de interés (ROI)**: rectángulo **normalizado 0..1 respecto del frame de vídeo** (por defecto: todo el frame). Recorte antes de pasar al motor. Las coordenadas de los resultados se devuelven en píxeles del frame de vídeo original (`videoWidth × videoHeight`); la conversión a coordenadas CSS del elemento mostrado (con `object-fit`) la hace la UI (F4) con un helper público `mapToElement()`.
4. **Ritmo adaptativo**: FPS de decodificación ajustado según tiempo medio de proceso, visibilidad de la página (`document.hidden` → pausa) y batería (`navigator.getBattery` cuando exista, opcional).
5. **Fusión multi-frame** (ADR-05)
   - Consenso de `N` lecturas idénticas en una ventana de `T` ms antes de emitir.
   - Deduplicación: no re-emitir el mismo `(format, bytes)` antes de `duplicateCooldownMs`.
   - Tracking ligero de posición: asociar resultados entre frames para dar un `trackId` estable (útil para overlay y multi-código). Ojo: en 1D ZXing devuelve la posición de una **línea** de escaneo (caja casi sin altura), así que la asociación no puede ser solo por IoU (ver diseño).
   - **Escalado cuando no se lee nada** (un código nunca leído no tiene track, así que la escalada no puede depender solo de tracks):
     - *Símbolos sin leer*: el motor se llama con `returnErrors` de ZXing, que devuelve la posición de símbolos detectados que fallaron el checksum/decodificación (`DecodeCandidate`, F2). Crean tracks de tipo `unread`; tras 2 frames fallidos en uno, el siguiente intento usa `thorough` solo en esa ROI expandida. Nunca se emiten como `detect`.
     - *Barrido rotativo*: si en `escalateAfterFrames` frames (default 3, único umbral compartido con el plugin IA de F5) no hay lecturas ni tracks `unread`, cada frame se procesa además con `thorough` en una zona distinta (centro, luego una cuadrícula 2×2 solapada).
     - Con el plugin IA (F5), al alcanzar el mismo umbral se ejecuta el detector y sus ROIs se añaden como tracks `unread`. Prioridad por frame: `unread` de ZXing → ROIs de IA → barrido rotativo.
6. **Eventos**: `detect` (resultado confirmado), `candidate` (lectura válida aún sin el consenso de fusión, para UI; no confundir con los tracks `unread`), `lost`, `state`, `error`, `frame` (stats opcionales: fps, ms/frame).
7. **Ciclo de vida**: `start()`, `pause()`, `resume()`, `stop()`, `destroy()`; idempotentes y sin fugas (tracks detenidos, worker terminado, listeners liberados).
8. **Errores tipados** con `ScanError.code` (creado en F2.0): `PERMISSION_DENIED`, `NO_CAMERA`, `CAMERA_IN_USE`, `INSECURE_CONTEXT`, `UNSUPPORTED`, `ENGINE_LOAD_FAILED`. `createScanner()` en Node/Bun lanza `UNSUPPORTED`.
9. **Cambio de orientación del dispositivo** y cambios de resolución del stream (rotar el móvil) se manejan sin reiniciar: el worker recibe las nuevas dimensiones y el tracker se resetea.

### No debe

- Bloquear el main thread más de 4 ms por frame.
- Retener más de 2 frames en memoria.

## Criterios de aceptación (gate G3)

- [ ] En `bench` (vídeos, split `test`), según definiciones del README: % de vídeos leídos **mejor** y ttfr p50 **no peor** que `zxing-wasm` frame a frame a la misma resolución y FPS de proceso (igual que G3 en el README).
- [ ] false_read_rate y negatives_fp en vídeo no peores que el mejor competidor.
- [ ] Main thread (medido en Chromium e2e, Long Tasks API; Firefox/Safari no la tienen): tarea larga máxima < 50 ms y media < 4 ms/frame. En `android-mid`, medido con Chrome remote debugging (Performance panel) y registrado.
- [ ] 30 min de escaneo continuo en `android-mid` sin crecimiento > 10 % de: heap JS (Chrome remote debugging, `performance.memory`) y memoria WASM (`memory.buffer.byteLength`, expuesto por un hook de la demo). La memoria WASM no encoge: el criterio es que se estabilice tras los primeros 2 min.
- [ ] `destroy()` deja 0 tracks activos y el worker terminado (verificado en e2e).
- [ ] Funciona en todos los navegadores de "Plataformas soportadas" (prueba manual registrada en `docs/roadmap-v1/fase-3-camara/pruebas-dispositivos.md`), incluida la heurística de cámara principal en ≥ 2 Android con varias cámaras traseras.
