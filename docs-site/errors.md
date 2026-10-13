# Errores y solución de problemas

Toda la API pública lanza `ScanError` con un `code` estable y un `docsUrl` que apunta a la sección de esta página.

```ts
import { isScanError } from "@qhago/scanner";
try { await scanner.start(); } catch (e) { if (isScanError(e)) console.log(e.code, e.docsUrl, e.cause); }
```

Para reportar un problema adjunta `await getEnvironmentReport()` (navegador, funciones disponibles, configuración).

## PERMISSION_DENIED {#permission-denied}

El usuario (o la política del sitio) negó la cámara (`NotAllowedError`/`SecurityError`).

- Explica antes de `start()` por qué pides la cámara; `getPermissionState()` indica si ya está denegada.
- Si está denegada, el navegador no vuelve a preguntar: indica cómo reactivarla en los ajustes del sitio.
- En un `<iframe>`, añade `allow="camera"`.

## NO_CAMERA {#no-camera}

No hay cámara compatible (`NotFoundError`/`OverconstrainedError`), el stream no trae vídeo, o se llamó a un control
de cámara sin `start()`. Prueba sin `camera.deviceId` (pudo desconectarse) o con una `camera.resolution` menor.

## CAMERA_IN_USE {#camera-in-use}

Otra app o pestaña tiene la cámara, o el sistema no pudo iniciarla (`NotReadableError`). Ciérrala y reintenta;
llama siempre a `stop()`/`destroy()` al salir de la vista para no retenerla tú mismo.

## INSECURE_CONTEXT {#insecure-context}

La cámara solo existe en HTTPS o `localhost`. En desarrollo con un móvil, usa un túnel HTTPS o `vite --https`.

## UNSUPPORTED {#unsupported}

La plataforma no ofrece algo necesario: `getUserMedia` (navegador muy antiguo o WebView restringido), `createScanner()`
en Node/Bun (solo existe en navegador), linterna/zoom en una cámara que no los permite (consulta antes
`getCapabilities()`), cambiar de cámara con un `stream` externo, un escáner ya destruido, o un plugin que el worker
no registra (usa el `workerFactory` del paquete del plugin, p. ej. `aiWorker` de `@qhago/ai`).

## ENGINE_LOAD_FAILED {#engine-load-failed}

No se pudo cargar el motor WASM o el worker. El mensaje incluye la pista concreta:

- **Vite dev**: falta `optimizeDeps: { exclude: ["@qhago/scanner"] }`.
- **Node/Bun empaquetado** (`bun build`, esbuild, ncc): copia `wasm/qhago_engine_node.wasm` junto al bundle o usa
  `configure({ wasmUrl })`.
- **CDN + CSP**: falta `blob:` en `worker-src` (o `'wasm-unsafe-eval'` en `script-src`). Ver [CSP](/guia/bundlers#csp).
- **ABI distinta**: `wasmUrl` apunta a un `.wasm` de otra versión del paquete.
- **Servidor**: el `.wasm` debe servirse con `Content-Type: application/wasm`.

## INVALID_INPUT {#invalid-input}

Entrada u opción inválida: imagen sin dimensiones (un `<img>` que aún no cargó: espera a `img.decode()`), más píxeles
que `maxInputPixels` (16 MP por defecto: reduce la imagen), formato desconocido, `formats` vacío, `region` fuera de
rango, o números negativos en `maxSymbols`/`timeBudgetMs`.

## ABORTED {#aborted}

La operación se canceló con su `signal` (`AbortController`). Es el resultado esperado al cancelar: trátalo como
cancelación, no como fallo.

## Lecturas incorrectas

Una lectura con un valor distinto del real es el fallo más grave para la librería: [repórtalo](https://github.com/qhago-dev/scanner/issues/new?template=bug.yml)
con la imagen. Para reducir el riesgo: pide solo los formatos que usas, deja `validateChecksums` activado y usa un ROI.
