# Fase 4 — Tareas

## F4.1 — Revisión y congelación de la API
**Esfuerzo**: 4h · **Archivos**: `docs/roadmap-v1/fase-4-api-dx/api-1.0.md`, `packages/scanner/src/index.ts`
- [ ] Inventario de exports; eliminar lo interno (`WasmLoader`, etc.). Debe incluir todo lo público de F2/F3: `listCameras`, `getPermissionState`, `setTorch`, `setZoom`, `switchCamera`, el tipo `ScanErrorCode` y la opción `engine`
- [ ] Checklist: nombres alineados con BarcodeDetector, `AbortSignal`, sin `any`, defaults documentados en JSDoc (formatos por defecto de ADR-05)
- [ ] Tipos `ScannerPluginDescriptor`, opciones `plugins` y `workerFactory` reservados (sin plugins oficiales hasta F5)
- [ ] Test SSR: importar cada entry en Node sin DOM
- [ ] `api-extractor` (o `tsup --dts` + snapshot del `.d.ts`) para detectar cambios de API en CI

## F4.2 — Errores tipados
**Esfuerzo**: 3h · **Archivos**: `packages/scanner/src/errors.ts`
- [ ] Revisar códigos, mensajes y `docsUrl` de `ScanError` (creado en F2.0), incluidos los mensajes accionables de `ENGINE_LOAD_FAILED` (ABI distinta, Vite dev, CDN sin CORS)
- [ ] Test que verifica que ninguna API pública lanza algo que no sea `ScanError` (o `TypeError` en el polyfill, por spec)

## F4.3 — Polyfill BarcodeDetector
**Esfuerzo**: 4h · **Archivos**: `packages/scanner/src/polyfill/`
- [ ] Clase + `installPolyfill`
- [ ] Grabar fixtures de `BarcodeDetector` nativo en Chrome macOS y Android (script en la demo que exporta JSON)
- [ ] Test de contrato contra los fixtures
- [ ] Soporte de `HTMLVideoElement` y `SVGImageElement`

## F4.4 — Quagga-compat
**Esfuerzo**: 1 d · **Archivos**: `packages/scanner/src/quagga-compat/`
- [ ] API y mapeo de readers del diseño, incluidos `onProcessed`/`offProcessed`, `box/boxes/line`, `canvas.ctx/dom.overlay`, `ImageDebug.drawPath`
- [ ] Warnings una sola vez para opciones ignoradas
- [ ] Migrar el ejemplo "live_w_locator" de Quagga2 cambiando solo el import (en `apps/examples/quagga-migration`)

## F4.4b — `mapToElement`
**Esfuerzo**: 3h · **Archivos**: `packages/scanner/src/geometry.ts`
- [ ] `object-fit` cover/contain/fill, `object-position`, espejado
- [ ] Tests unitarios con casos de cada modo

## F4.5 — `<qhago-scanner>`
**Esfuerzo**: 1,5 d · **Archivos**: `packages/scanner/src/ui/`
- [ ] Custom Element con atributos/props del diseño
- [ ] Overlay animado por `trackId`
- [ ] Linterna, cambio de cámara, beep (WebAudio, sin assets), vibración
- [ ] Accesibilidad (`aria-live`, foco, contraste) y labels es/en

## F4.6 — Parsers
**Esfuerzo**: 1 d · **Archivos**: `packages/scanner/src/parsers/`
- [ ] GS1 con tabla generada
- [ ] QR: URL, WIFI, vCard, MeCard, geo, tel, mailto, SMS
- [ ] AAMVA (ejemplos desde el estándar + PDF417 sintéticos propios) e ISO 15434
- [ ] Tests con los ejemplos de las GS1 General Specifications y, para AAMVA, ejemplos construidos desde el estándar + sintéticos

## F4.7 — Diagnóstico
**Esfuerzo**: 2h · **Archivos**: `packages/scanner/src/diagnostics.ts`
- [ ] `getEnvironmentReport()`
- [ ] Página en la demo que lo muestra y permite copiarlo

## F4.8 — Release beta
**Esfuerzo**: 1h
- [ ] `changeset pre exit` → `pre enter beta`; publicar `0.x.y-beta.N` (dist-tag `beta`); anunciar API congelada en CHANGELOG
- [ ] Borrador de la guía "Escanear archivos" (se publica en F7.5)
