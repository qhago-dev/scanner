---
"@qhago/scanner": minor
---

**API congelada (beta).** Desde aquí rige semver estricto: cualquier cambio en `api/public-api.md` es un cambio
de API y se documenta.

- Nuevos subpaths: `@qhago/scanner/polyfill` (BarcodeDetector), `/quagga-compat` (API estilo Quagga2),
  `/ui` (`<qhago-scanner>`), `/parsers` (GS1, QR, AAMVA, ISO 15434) y `/worker-host`.
- `mapToElement()` / `mapPoints()` para pasar de coordenadas del vídeo a CSS (object-fit, object-position, espejado).
- `getEnvironmentReport()` para diagnóstico.
- Puntos de extensión reservados: `plugins` (`ScannerPluginDescriptor`) y `workerFactory` por llamada en `decode()`.
- `decode()` valida `strategy`, `region`, `maxSymbols`, `timeBudgetMs` y `maxInputPixels` (`INVALID_INPUT`).
