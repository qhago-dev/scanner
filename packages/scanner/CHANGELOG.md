# @qhago/scanner

## 0.1.0-beta.0

### Minor Changes

- 17fd3ca: **API congelada (beta).** Desde aquí rige semver estricto: cualquier cambio en `api/public-api.md` es un cambio
  de API y se documenta.

  - Nuevos subpaths: `@qhago/scanner/polyfill` (BarcodeDetector), `/quagga-compat` (API estilo Quagga2),
    `/ui` (`<qhago-scanner>`), `/parsers` (GS1, QR, AAMVA, ISO 15434) y `/worker-host`.
  - `mapToElement()` / `mapPoints()` para pasar de coordenadas del vídeo a CSS (object-fit, object-position, espejado).
  - `getEnvironmentReport()` para diagnóstico.
  - Puntos de extensión reservados: `plugins` (`ScannerPluginDescriptor`) y `workerFactory` por llamada en `decode()`.
  - `decode()` valida `strategy`, `region`, `maxSymbols`, `timeBudgetMs` y `maxInputPixels` (`INVALID_INPUT`).

- ec9fa1c: Lector EAN-13/UPC-A para códigos desenfocados (deconvolución en la cuadrícula de módulos + programación
  dinámica con dígito de control). En `decode()` balanced/thorough actúa cuando la cascada no lee ningún EAN/UPC
  y como verificación cruzada de los de poca confianza; en la cámara, como un paso más del escalado (una línea por
  turno, ≤ 30 % del tiempo, confirmado en 2 frames). Fotos públicas: recall 76,6 → 80,2 % y desenfocadas
  11,8 → 53,9 %, sin lecturas falsas nuevas.
- a65c643: Primera versión de `decode()`: ZXing-C++ v3.1.1 en WebAssembly (13 formatos), cascada fast/balanced/thorough
  con preproceso clásico, región, validación, errores tipados (`ScanError`), worker interno en navegador y
  soporte de Node ≥ 22.12 y Bun.

### Patch Changes

- 3a4c114: Cámara: la inferencia del detector IA en vídeo se limita al 25 % del tiempo (en un Android de gama media cada
  inferencia WASM tarda ~1 s y bloqueaba el worker: frames de 1-3 s). Los EAN/UPC leídos solo por pasadas de
  escalado (barrido, ROI de un track, plugins) se confirman en 2 frames; los de la pasada normal, en 1.
- b9f8760: Node/Bun: si el `.wasm` no está junto al JS (app empaquetada con `bun build`, esbuild, ncc…), `ENGINE_LOAD_FAILED`
  explica cómo resolverlo: copiar `wasm/qhago_engine_node.wasm` junto al bundle o usar `configure({ wasmUrl })`.
- ce49420: Lector EAN para códigos desenfocados: no intenta leer por debajo de 1,5 px por módulo (en una miniatura de
  140×38 px daba otro EAN con dígito de control válido). Nueva opción experimental
  `advanced.deblurProposals` (default `false`): las cajas propuestas por plugins (detector de `@qhago/ai`) también
  alimentan a ese lector en `decode()`, con 3 líneas de acuerdo y ninguna discrepante. En fotos desenfocadas
  derivadas de las públicas suma lecturas (+43 objetos en 809, ninguno perdido) pero aún da 1 lectura falsa nueva en
  4575 imágenes: queda desactivada hasta validarla con fotos reales del dispositivo.
- 68b37c2: Lector EAN para desenfoque en `decode()`: no afina tramos sin opciones (ajuste grueso < 0,7), prueba las líneas
  del centro hacia fuera y abandona una región si sus 2 primeras líneas no llegan a 0,6. Mismas lecturas foto a foto
  en todos los conjuntos de evaluación; p95 de `decode()` en fotos públicas 311 → 235 ms (p99 578 → 429 ms).
- 23fdf80: Lecturas falsas: si dos resultados lineales (1D) con distinto contenido caen sobre el mismo símbolo, se
  descartan (salvo que uno tenga un consenso de líneas claramente mayor). En fotos reales públicas las lecturas
  falsas bajan de 18 a 7 (1,2 % → 0,5 %) con recall 76,9 → 76,5 %; con el detector IA, 19 → 9 con recall igual.
- 5e25efc: Cámara: un EAN/UPC con confianza < 1 (≤ 3 líneas de barrido de acuerdo) se confirma en 2 frames. En fotos reales
  de un envase arrugado la pasada normal devolvía EAN falsos con checksum válido, todos con confianza 0,5-0,75.
- f686758: Paquete: los tipos (`.d.ts`) usan imports con extensión y resuelven con `moduleResolution: node16/nodenext`
  (antes quedaban en `any`), y el tarball incluye `LICENSE`, `NOTICE` y el texto de la licencia Apache 2.0 de ZXing-C++.
- fc0a8fa: Las lecturas de plugins (detector IA) pasan por la misma verificación que las de la cascada: relectura normal
  de la zona y descarte de lecturas 1D que contradicen a otra. En fotos reales de Android, con IA las lecturas
  falsas bajan de 8 a 3 (modo "always") sin perder lecturas; en fotos públicas (dev) 4 → 2.
- 1f3affc: Motor: el redimensionado bicúbico (fotos de más de 2560 px y pasadas multiescala) es separable y con pesos
  precalculados. Mismos resultados; una foto de 6,6 MP pasa de ~350 a ~90 ms en la primera pasada y en las fotos
  públicas de `dev` el p95 de `decode()` baja de 499 a 311 ms (p99 931 → 578 ms).
- 793ff50: Cámara: el barrido de escalado (thorough) se reparte en rebanadas (zona × preproceso), una por frame vacío,
  en lugar de ejecutar las 13 pasadas de golpe. En un Android de gama media cada frame de barrido pasaba de
  ~650 ms a decenas de ms, así que el motor ya no está ocupado cuando el código entra en cuadro.
- d169583: Lecturas falsas: un EAN/UPC encontrado solo por las pasadas "harder" se relee sin "harder" en dos vistas
  de su zona; si alguna da otro número, se descarta. Corrige lecturas falsas con checksum válido sobre envases
  arrugados (reproducidas también en zxing-wasm upstream). Coste: p95 de `decode()` balanced 165 → 327 ms en
  fotos reales públicas; recall 76,6 %.
- 0660137: Cámara (ruta track-processor, Chrome Android): el intervalo entre frames del worker solo podía crecer
  (`max(minInterval, 1,2·EMA)`), así que un frame lento aislado —carga del modelo IA, un barrido— dejaba la
  cámara a < 1 fps el resto de la sesión (medido: un frame cada 5,8 s tras cargar la IA). El worker usa ahora
  el mismo planificador que el hilo principal: 1,2 × mediana de los últimos 8 frames, acotado entre maxFps y 4 fps.
