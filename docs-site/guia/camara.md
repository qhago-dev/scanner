# Cámara: permisos, HTTPS e iOS

```ts
import { createScanner, isScanError } from "@qhago/scanner";

const scanner = createScanner({ video, formats: ["ean_13", "qr_code"] });
scanner.on("detect", ({ result }) => agregar(result.text)); // una vez por código confirmado
scanner.on("error", ({ error }) => mostrar(error.code, error.docsUrl));
try {
  await scanner.start();
} catch (e) {
  if (isScanError(e)) mostrar(e.code, e.docsUrl);
}
```

## Requisitos

- **Contexto seguro**: HTTPS o `localhost`. En HTTP, `start()` lanza [`INSECURE_CONTEXT`](/errors#insecure-context).
- **Permiso**: el navegador lo pide en el primer `start()`. Si el usuario lo niega:
  [`PERMISSION_DENIED`](/errors#permission-denied). `getPermissionState()` permite comprobarlo antes.
- **iOS / Safari ≥ 16.4**: el `<video>` necesita `playsinline` y `muted` (la librería los pone si crea el vídeo).
  Safari no tiene `MediaStreamTrackProcessor`: se usa `requestVideoFrameCallback` automáticamente.

## Eventos

| Evento | Cuándo |
|---|---|
| `detect` | Un código nuevo confirmado. Con `fusion.confirmFrames: "auto"` (defecto): 1 frame para lecturas fiables; 2 para formatos débiles (Codabar, ITF…), Code 128 corto, EAN/UPC de baja confianza y lecturas de pasadas de escalado |
| `track` | El mismo código sigue en cuadro (posición actualizada; sirve para dibujar el overlay) |
| `candidate` | Hay un símbolo que aún no se pudo leer (para guiar al usuario) |
| `lost` | Un código salió del cuadro |
| `frame` | Estadísticas por frame (`frameStats: true`) |
| `state` / `error` | Cambios de estado y errores |

## Controles

`getCapabilities()` (linterna, zoom), `setTorch(on)`, `setZoom(z)`, `listCameras()`, `switchCamera(id)`,
`pause()`/`resume()`, `stop()` y `destroy()` (libera la cámara y el worker). La cámara principal trasera se elige
por capacidades, no por nombre, y la elegida se recuerda entre sesiones (`camera: { rememberCamera: false }` lo
desactiva). Resolución por defecto: 1280×720 (`camera.resolution`).

Coordenadas: los resultados vienen en píxeles del vídeo; `mapToElement(result.cornerPoints, video)` las pasa a
píxeles del elemento (respetando `object-fit` y espejo) para dibujar encima.
