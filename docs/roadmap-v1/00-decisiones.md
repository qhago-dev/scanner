# Decisiones de arquitectura (ADRs)

Formato: contexto → decisión → consecuencias. Estado: `Propuesta` hasta que se valide en la fase indicada.

---

## ADR-01 — Un solo módulo WASM (Emscripten) con ZXing-C++ + preproceso; Rust fuera del camino crítico

**Estado: Aceptada (F0.4, 2026-10-10).** Evidencia (Node 24, Emscripten 6.0.2, 440 imágenes de `zxing-cpp/test/samples`, `tryHarder`):

| Criterio | Build propio (zxing-cpp v3.1.1, solo lectores, `-Oz -flto -fwasm-exceptions`) | `zxing-wasm` 3.1.5 (reader) |
|---|---|---|
| `.wasm` raw / gzip -9 | 604 KB / **311 KB** | 967 KB / 417 KB |
| Lecturas | 437 / 440 | 437 / 440 |
| ms por imagen (media) | 1,87 (entrada luma) | 2,60 (entrada RGBA; incluye su conversión) |
| Preproceso propio en el mismo heap | Sí | No |
| Opciones de ZXing expuestas | Todas (controlamos el bridge) | Las que expone su API |
| Mantenimiento | Actualizar el submódulo + rebuild | Actualizar dependencia |

La diferencia de latencia está sesgada (la entrada no es idéntica); lo concluyente es el tamaño y el control del heap. ZXing v3 expone `lineCount`, `orientation`, `isInverted`, `ecLevel`, `returnErrors` y `validateOptionalChecksum`, así que el diseño de F2 es implementable sin parches al upstream.

**Contexto.** Hoy hay dos módulos WASM (Rust/wasm-bindgen + ZXing/Emscripten) comunicados por base64 vía JS. El pipeline Rust no funciona y su modelo síncrono (`process_frame`) es incompatible con la inferencia asíncrona de ONNX Runtime Web.

**Decisión.**
- El núcleo nativo es **un único `.wasm` compilado con Emscripten**: ZXing-C++ (solo lectores) + un bridge C++ propio + rutinas de preproceso clásico en C++.
- La **orquestación** (cámara, worker, fusión multi-frame, IA) se hace en **TypeScript**.
- `core/src/*.rs` se archiva en `archive/rust-core/` (no se borra).

**Consecuencias.** Un solo heap, sin copias base64, se pasa memoria por punteros (`HEAPU8.set`). Se pierde la vía "Rust → uniffi → nativo"; para móvil nativo (F8) se reutiliza ZXing-C++ directamente o las APIs del SO.

**Alternativa evaluada en F0.** Depender de `zxing-wasm` (MIT) en lugar de compilar. Se descarta como base si no permite: preproceso propio en el mismo heap, build solo-lectores y control del tamaño. Se usa igual como **competidor** en F1.
Si en F0.4 se adopta `zxing-wasm`: F2.1-F2.2 se sustituyen por la integración del paquete, el preproceso (F2.3-F2.4) pasa a un WASM pequeño propio o a TS, y la comparación de G2 contra `zxing-wasm` pasa a medir solo el valor añadido (preproceso + cascada).

## ADR-02 — Todo el procesamiento en un Web Worker

**Decisión.** El main thread solo captura frames y pinta overlay. Decodificación, preproceso e IA corren en un Worker módulo (`new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })`). Los frames viajan como `VideoFrame` o `ImageBitmap` **transferibles**.

**Consecuencias.** UI fluida (gate G3). Requiere fallback en main thread si el entorno no soporta workers módulo (opción `worker: false`).

**Alcance ampliado a `decode()`.** En el main thread de un navegador, `decode()` delega por defecto en un worker interno compartido (creado perezosamente), porque la estrategia `thorough` puede tardar cientos de ms. Se desactiva con `decode(img, { worker: false })`. Dentro de un Worker, en Node y en Bun se ejecuta en el hilo actual.

## ADR-03 — Prohibidos los modelos generativos de restauración (super-resolución, deblur)

**Contexto.** El plan anterior incluía ESRGAN Tiny y un UNet de deblur. Estas redes sintetizan detalle de alta frecuencia: pueden **inventar barras/módulos** y producir lecturas válidas pero incorrectas (las simbologías sin checksum fuerte —Code39, Codabar, ITF sin dígito, QR de baja corrección— no lo detectan).

**Decisión.** No se publica ningún modelo que modifique los píxeles que llegan al decodificador. La IA solo puede **localizar, clasificar y estimar geometría**. La restauración se hace con operaciones clásicas, deterministas y auditables (contraste, nitidez, reescalado bicúbico, binarización).

## ADR-04 — Un solo detector IA con keypoints, opcional y en paquete aparte

**Decisión.** Un modelo (familia NanoDet-Plus / RTMDet, Apache 2.0) que devuelve por objeto: caja, 4 esquinas, clase (1D/QR/DataMatrix/PDF417/Aztec) y confianza. Sustituye a los modelos de detección + perspectiva + autofocus. Se distribuye en `@qhago/ai` con `onnxruntime-web` como `peerDependency`. Backend: WebGPU → WASM SIMD (+threads si hay `crossOriginIsolated`). WebGL no se usa.

**Consecuencias.** El paquete base queda ligero. La IA solo entra a 1.0 si pasa el gate G5.

## ADR-05 — Fusión multi-frame y validación antes de emitir

**Decisión.** Un resultado se emite cuando: (a) pasa validación de checksum de la simbología si existe y (b) se confirma en `N` frames (por defecto `N=2` para simbologías sin checksum fuerte —Code39, Code93, Codabar, ITF, Code128 corto (< 6 caracteres)—, `N=1` para EAN/UPC/QR/DataMatrix/Aztec/PDF417). Deduplicación por `(format, bytes)` con ventana temporal configurable.

**Formatos por defecto.** Para reducir falsas lecturas, `formats` por defecto = `ean_13, ean_8, upc_a, upc_e, code_128, code_39, qr_code, data_matrix`. El resto (Codabar, ITF, Code93, PDF417, Aztec) es opt-in. Se revisa con datos de F1 (falsas lecturas por formato).

**Consecuencias.** Reduce falsas lecturas, el KPI principal. Añade ~1 frame de latencia en 1D sin checksum.

## ADR-06 — Empaquetado: ESM-only, assets resolubles por `import.meta.url`

**Decisión.**
- `"type": "module"`, `exports` con `types` + condiciones por entorno; sin build CJS en 1.0. Node ≥ 22.12 soporta `require()` de ESM síncrono sin flag y sin top-level await, así que el código de entrada **no usa top-level await**; queda documentado.
- El `.wasm` y el worker se resuelven con `new URL('./x', import.meta.url)` — lo entienden Vite (build), webpack 5, Rollup, esbuild, Parcel, Bun y Node.
- **Vite en dev**: el pre-bundling de dependencias (`optimizeDeps`) reubica los módulos y rompe las URLs relativas. Solución documentada (una línea): `optimizeDeps: { exclude: ["@qhago/scanner"] }`. El error `ENGINE_LOAD_FAILED` incluye esta pista cuando detecta la ruta `/.vite/deps/`.
- **CDN**: un `Worker` no puede cargarse desde otro origen. Si la URL del worker no es del mismo origen que la página, el SDK crea un worker módulo desde un `Blob` que hace `import` de la URL remota (requiere CORS, que jsDelivr/unpkg dan, y `worker-src blob:` en CSP). Para CDN se usan las rutas directas a `dist/` (`https://cdn.jsdelivr.net/npm/@qhago/scanner@1/dist/browser/index.js`), **no** los servicios que re-empaquetan (`/+esm`, esm.sh), porque reescriben rutas y rompen `import.meta.url`.
- **Un único punto de configuración global**: `configure({ wasmUrl, wasmModule, workerUrl, workerFactory })`. `init()` precarga usando esa configuración (y acepta las mismas opciones como atajo, que se fusionan con `configure`). `createScanner()` y `decode()` aceptan `workerFactory` por llamada (para plugins, F5). Tabla completa en F4.
- **Workers sin imports dinámicos**: el worker del SDK se publica como un único módulo sin `import()` dinámicos, porque Vite construye los workers en formato `iife` por defecto y ese formato no admite code-splitting. Si un worker de terceros (p. ej. `@qhago/ai` con ONNX Runtime) los necesita, se documenta `worker: { format: "es" }` en Vite.
- **Comprobación de versión**: el WASM exporta `sa_abi_version()`; el JS la compara con la suya y lanza `ENGINE_LOAD_FAILED` con un mensaje claro si un `wasmUrl` self-hosted no coincide con la versión del paquete.
- **SSR-safe**: ningún módulo accede a `window`, `document`, `navigator` ni crea workers al importarse; solo al llamar funciones.
- Subpath `@qhago/scanner/wasm/*` exportado para copiar assets.
- Build con `tsup` (o `tsdown`) + `wasm-opt -Oz`.

## ADR-07 — Dos niveles de API + compatibilidad con estándares

**Decisión.**
- Bajo nivel: `decode(image, options) → Promise<BarcodeResult[]>`.
- Alto nivel: `createScanner(options) → Scanner` (cámara, eventos, ciclo de vida).
- Compatibilidad: `BarcodeDetectorPolyfill` con la misma forma que la API web (`detect()`, `getSupportedFormats()`), y `@qhago/scanner/quagga-compat` con un subconjunto de la API de Quagga2 para migración.
- Usar `BarcodeDetector` nativo **solo si el usuario lo pide** (`engine: 'native' | 'wasm' | 'auto'`, por defecto `'wasm'`) para tener resultados consistentes entre navegadores.

## ADR-08 — Modelos y WASM se distribuyen dentro de paquetes npm, no en una CDN propia

**Contexto.** `cdn.scanai.dev` no existe y una CDN propia es un punto único de fallo y un problema de privacidad/CSP para clientes.

**Decisión.** Los binarios viajan en el paquete npm. Las CDNs públicas (jsDelivr/unpkg) funcionan automáticamente por ser npm. Caché en navegador con **Cache API** (nunca `localStorage`).

## ADR-09 — Licencias

**Decisión.** Código propio MIT. `NOTICE` incluye: ZXing-C++ (Apache 2.0), stb_image (MIT/dominio público, solo build Node), libzueci (BSD-3-Clause, dentro de ZXing), runtime de Emscripten (MIT), libc++/libc++abi (Apache 2.0 con excepción LLVM), musl (MIT) y, en `@qhago/ai`, onnxruntime-web (MIT). Solo dependencias MIT/Apache-2.0/BSD/ISC. CI ejecuta `license-checker` sobre las deps de runtime y falla si aparece GPL/AGPL/LGPL/SSPL. La auditoría de las librerías C/C++ enlazadas en el WASM se hace a mano en F0.4 (license-checker no las ve). Datasets: se registra licencia de cada fuente; los no comerciales solo se usan para evaluación, nunca para entrenar modelos publicados.

## ADR-10 — Monorepo con bun workspaces

**Decisión.**
```
ScanAI-SDK/
├── packages/
│   ├── scanner/        # @qhago/scanner  (TS + WASM)
│   ├── engine-wasm/    # build C++ (ZXing + bridge + preproceso) → artefactos para scanner
│   └── ai/             # @qhago/ai   (F5, opcional)
├── apps/
│   ├── demo/           # demo web (Vite)
│   └── examples/       # las 11 apps de F7 (vite, vite-dev, webpack, next, astro, bun, node, cdn, csp, quagga…)
├── bench/              # harness y dataset (F1)
├── training/           # Python (F5)
├── archive/            # rust-core, wrappers antiguos
└── docs/
```
Herramientas: bun (workspaces, scripts), **Vitest** para unit e integración (incluye browser mode con Playwright para correr la misma suite en Chromium/Firefox/WebKit), una suite pequeña con `bun test` que verifica el runtime Bun, Playwright para e2e, changesets para versionado (desde F0).

## ADR-11 — Nombre del paquete

**Estado: Aceptada (F0.7, 2026-10-10).** Nombres: `@qhago/scanner` (paquete principal) y `@qhago/ai` (detector opcional); custom element `<qhago-scanner>`; prefijo CSS `--qhago-*`. El scope `@qhago` no existía en npm a esa fecha (`npm view @qhago/scanner` → 404, "Scope not found"). La organización npm la crea el autor (ver `docs/release/acciones-externas.md`).

## ADR-12 — Privacidad de los datos de benchmark y entrenamiento

**Contexto.** Las fotos reales de códigos pueden contener datos personales: licencias de conducir (PDF417/AAMVA), DNI, etiquetas de envío con nombre y dirección, caras, pantallas con datos.

**Decisión.**
- No se capturan documentos de identidad ni envíos reales de terceros. Para PDF417/AAMVA y etiquetas de envío se usan **impresiones de datos sintéticos** fotografiadas con cámara real.
- Revisión antes de subir cada lote: se descartan o difuminan caras, nombres, direcciones y pantallas con datos personales.
- El dataset vive en almacenamiento privado (bucket con acceso por credencial de CI). Solo se publica, si se publica, la parte de licencia propia ya revisada.
- Los textos de los códigos en el manifest no deben contener datos personales reales.
