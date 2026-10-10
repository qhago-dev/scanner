# API 1.0 — inventario y checklist (F4.1)

La fuente de verdad es [`packages/scanner/api/public-api.md`](../../../packages/scanner/api/public-api.md),
generado por `scripts/api-report.ts` con el compilador de TypeScript. CI (`api:check`) falla si cambia sin regenerarlo.
Un diff en ese archivo es un cambio de API: requiere changeset y, si rompe, major.

## Entry points

| Import | Exports |
|---|---|
| `@qhago/scanner` | `decode`, `init`, `configure`, `createScanner`, `Scanner`, `listCameras`, `getPermissionState`, `mapToElement`, `mapPoints`, `getEnvironmentReport`, `ScanError`, `isScanError`, `FORMATS`, `DEFAULT_FORMATS`, `isBarcodeFormat` + tipos (`BarcodeResult`, `DecodeOptions`, `ScannerOptions`, `ScannerEvent`, `TrackedResult`, `ScanErrorCode`, `ScannerPluginDescriptor`, `EnvironmentReport`…) |
| `@qhago/scanner` (Node/Bun) | lo mismo salvo cámara: `createScanner` lanza `UNSUPPORTED`; sin `listCameras`/`getPermissionState` |
| `@qhago/scanner/polyfill` | `BarcodeDetectorPolyfill`, `installPolyfill`, `DetectedBarcode` (también en Node/Bun) |
| `@qhago/scanner/parsers` | `parseGS1`, `gs1CheckDigit`, `parseQRContent`, `parseAAMVA`, `isAAMVA`, `parseISO15434`, `isISO15434` |
| `@qhago/scanner/quagga-compat` | `Quagga` (default), `isValidVin`, tipos `QuaggaJS*` |
| `@qhago/scanner/ui` | registra `<qhago-scanner>`; `QhagoScannerElement`, `LABELS` |
| `@qhago/scanner/worker-host` | `startWorkerHost` (para workers compuestos, p. ej. `@qhago/ai`) |
| `@qhago/scanner/wasm/*` | binarios para self-hosting |

Métodos de `Scanner`: `start({signal})`, `pause`, `resume`, `stop`, `destroy`, `on/off`, `getCapabilities`,
`setTorch`, `setZoom`, `listCameras`, `switchCamera`; getters `state`, `video`, `route`.

No exportado (interno): `Engine`, cargadores del motor, `ScannerSession`, `Tracker`, `Fusion`, `Scheduler`,
protocolo del worker (salvo los tipos de mensaje en `worker-host`).

## Checklist

- [x] Nombres de formato = `BarcodeDetector` (`ean_13`, `qr_code`…); el polyfill usa `rawValue`/`cornerPoints` de la spec.
- [x] Todo lo asíncrono devuelve `Promise` y acepta `signal` (`decode`, `init`, `Scanner.start`).
- [x] Sin `any` en los tipos públicos (comprobado en `public-api.md`).
- [x] Defaults documentados en JSDoc (formatos por defecto de ADR-05, `strategy`, `maxFps`, `maxCodes`…).
- [x] SSR-safe: cada entry se importa en Node sin DOM (`test/integration/ssr.test.ts`).
- [x] Errores: toda API pública rechaza con `ScanError` (`test/integration/errors.test.ts`); el polyfill lanza
      `TypeError` donde la spec lo exige.
- [x] Puntos de extensión: `plugins?: ScannerPluginDescriptor[]` en `decode()` y `createScanner()`;
      `workerFactory` global (`configure`), por llamada (`decode`) y por instancia (`createScanner`).

## Plugins (interfaz reservada; implementación en F5)

```ts
interface ScannerPluginDescriptor {
  name: string;            // p. ej. "qhago-ai-detector"
  apiVersion: 1;
  options?: Record<string, string | number | boolean | null>;   // serializable (cruza al worker)
}
```

El descriptor viaja al worker, que lo resuelve por `name` en el registro que le da `startWorkerHost({ plugins })`.
Sin un worker que registre el plugin (es decir, sin `workerFactory` de `@qhago/ai`), `decode()` y `Scanner.start()` lanzan `ScanError("UNSUPPORTED")` con un mensaje que lo explica. El worker anuncia sus plugins en el mensaje `ready`; la interfaz del lado del worker (`ScannerPlugin`, `PluginProposal`, `startWorkerHost({ plugins })`) se exporta desde `@qhago/scanner/worker-host` (F5.6, extensión compatible).

## Configuración

Ver la tabla de fuente única en [disenio.md](./disenio.md#configuración-fuente-única).
