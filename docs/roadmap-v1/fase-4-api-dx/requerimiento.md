# Fase 4 — API pública y experiencia de desarrollo

**Esfuerzo**: 5-6 días · **Prioridad**: Alta · **Depende de**: F3 · **Versión**: pre-tag `beta`

## Problema

Una librería se adopta por lo fácil que es integrarla y migrar a ella. Quagga2 tiene muchos usuarios con código existente; `BarcodeDetector` es el estándar web. Hoy la API es inestable y no hay ayudas de UI ni de parseo de contenido.

## Requerimiento

Congelar la API 1.0 y añadir las piezas que hacen que integrar sea trivial.

### Debe

1. **API congelada** (`decode`, `init`, `configure`, `createScanner`, `mapToElement`, `getEnvironmentReport`, tipos, errores) revisada con checklist de diseño (nombres consistentes con `BarcodeDetector`, todo asíncrono devuelve `Promise` y acepta `AbortSignal`, opciones con defaults documentados —incluidos los formatos por defecto de ADR-05—, sin `any` en tipos públicos, SSR-safe al importar).
   - Puntos de extensión reservados: `plugins?: ScannerPluginDescriptor[]` (`{ name: string; options: <JSON serializable> }`) y `workerFactory?: () => Worker` existen en los tipos desde aquí (sin plugins oficiales en 1.0) para que F5 no sea un breaking change. `workerFactory` también sirve a quien necesite servir el worker de forma personalizada.
   - `ScanError` ya existe desde F2.0; aquí solo se revisan códigos, mensajes y `docsUrl`.
2. **`BarcodeDetectorPolyfill`** (`@qhago/scanner/polyfill`): misma interfaz que la API web; `installPolyfill()` lo registra en `globalThis.BarcodeDetector` solo si no existe (o si se fuerza). `detect()` acepta todo `ImageBitmapSource` de la spec, incluidos `HTMLVideoElement` (frame actual) y `SVGImageElement`.
3. **Compatibilidad Quagga2** (`@qhago/scanner/quagga-compat`): `init(config, cb)`, `start()`, `stop()`, `onDetected(cb)`, `offDetected(cb)`, `onProcessed(cb)`, `offProcessed(cb)`, `decodeSingle(config, cb)`, `canvas` (`ctx.overlay`, `dom.overlay`) e `ImageDebug.drawPath`, con el formato de resultado de Quagga (`codeResult.code`, `codeResult.format`, `box`, `boxes`, `line`). Es lo que usa el ejemplo `live_w_locator` comprometido en los criterios. Tabla de equivalencias de `readers` → formatos.
4. **Helper de coordenadas** `mapToElement(points, videoEl)`: convierte puntos del frame de vídeo a coordenadas CSS del elemento, teniendo en cuenta `object-fit` (`cover`/`contain`/`fill`), `object-position` y el espejado de la cámara frontal.
5. **Overlay de UI opcional** (`@qhago/scanner/ui`): componente vanilla (Custom Element `<qhago-scanner>`) con vídeo, marco de ROI, resaltado de códigos por `trackId`, botón de linterna/cambio de cámara, feedback háptico (`navigator.vibrate`) y sonido opcional. Sin dependencias, estilable con CSS custom properties, accesible (anuncia la lectura con `aria-live`).
6. **Parsers de contenido** (`@qhago/scanner/parsers`, tree-shakeable): GS1 (AIs con fechas, lotes, GTIN), URL/WiFi/vCard/MeCard para QR, AAMVA (licencias PDF417), ISO 15434.
7. **Escaneo de archivos**: `decode(file)` acepta imágenes; guía "Escanear archivos" (región, imágenes grandes, varias páginas/fotos en lote). PDF queda fuera (se sugiere pdf.js en docs).
8. **Diagnóstico**: `getEnvironmentReport()` (soporte de WASM SIMD, workers módulo, TrackProcessor, cámara, contexto seguro, crossOriginIsolated) para soporte técnico y para la página de la demo.
9. **Mensajes de error** accionables con enlace a la FAQ (`docs/…#permission-denied`).

### No debe

- Romper la API después de esta fase sin un major (desde aquí rige semver estricto, aunque sea 0.x se documentan breaking changes).
- Incluir frameworks (React/Vue) en el paquete principal (F8).

## Criterios de aceptación

- [ ] Documento `api-1.0.md` aprobado con la superficie completa (generado de TypeDoc + revisión manual).
- [ ] Tests de contrato del polyfill contra **fixtures grabados** de `BarcodeDetector` nativo (Chrome macOS y Android; en Linux no existe): mismas formas (`format`, `rawValue`, `boundingBox`, `cornerPoints`), mismo orden de esquinas y mismos errores (`TypeError` por formato desconocido).
- [ ] Ejemplo oficial de Quagga2 migrado cambiando solo el import.
- [ ] `<qhago-scanner>` funciona en una página HTML plana desde CDN (ruta directa a `dist/`, ADR-06).
- [ ] `mapToElement` probado con `object-fit` cover/contain y cámara frontal espejada.
- [ ] Importar cada entry point en Node sin DOM no lanza errores (SSR).
- [ ] Parsers con tests: GS1 con los ejemplos de las GS1 General Specifications; AAMVA con ejemplos construidos a partir del AAMVA DL/ID Card Design Standard (no hay vectores públicos oficiales) más PDF417 sintéticos generados por nosotros (ADR-12).
- [ ] Cada entry point es tree-shakeable (verificado con `size-limit` por entry).
