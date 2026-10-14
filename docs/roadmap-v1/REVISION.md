# Registro de revisión de los SDD

## Fase 12 v2 — 2026-10-13 (revisión independiente)

- v1 → APROBADO CON CORRECCIONES (0 bloqueantes, 2 importantes). La revisión verificó el rango con semver y la opción
  `onlyUpdatePeerDependentsWhenOutOfRange` en el código de `@changesets/assemble-release-plan` 6.0.10 (respeta el
  modo pre). Importantes:
  - G7a de fase 7 dice `0.x.y-rc.N`: el RC será `0.1.0-rc.N`, cubierto por el rango (aclarado en fase 7, y la
    guarda lo exige);
  - la guarda debe correr en `release:dry` y tras `changeset version`, y cubrir el flujo de changesets/action
    (CI de la PR «Version Packages» y `release.yml`).
- v2: ambos aplicados. Además, la guarda comprueba el plan de changesets (camino negativo verificado), y se añaden
  los riesgos de pnpm/yarn y del peer de ORT.

## Fase 11 v2 — 2026-10-13 (revisión independiente)

- v1 → NO APROBADO (4 bloqueantes): el e2e "con IA" en modo `fallback` con un fixture nítido nunca ejecuta la IA;
  código de error inventado (`CAMERA_DENIED` → `PERMISSION_DENIED`, más `NO_CAMERA`, `CAMERA_IN_USE`,
  `INSECURE_CONTEXT`); `workflow_call` con una sola versión para dos paquetes no agrupados por changesets; ffmpeg
  no viene en ubuntu-latest y el generador del y4m ya existía.
- v2 (aplicada al implementar, decisiones delegadas por el autor): `?ai=always` en el e2e de IA (verifica `.onnx`,
  `ort-wasm*.wasm` y lectura, ≤ 60 s); códigos reales con ayuda por código; `release.yml` exporta `scanner` y `ai`;
  `apt-get install ffmpeg` y `make-video.sh` adaptado; issue automático si falla tras Release o en el canario;
  peso definido (inicial ≤ 60 KB, sin IA ≤ 450 KB); e2e `vite dev` en la prueba de plantilla; dos entradas de foto
  (galería / cámara); `tsconfig` autónomo; rutas de Pages desde `configure-pages`. Hallazgo nuevo (fuera de
  alcance): el peer de `@qhago/ai` no admite prereleases de otra minor.

## Fase 10 v3 — 2026-10-12 (tres pasadas de revisión independiente)

Resultado final: **APROBADO** (0 bloqueantes, 0 importantes; 2 menores y 2 dudas aplicados).

- v1 → NO APROBADO (3 bloqueantes, 11 importantes): la suficiencia "≥ 30 objetos" dejaba sin veredicto defocus (27
  objetos reales) y EAN-8; EAN-8 desenfocado no medible; M7 no medible (cámara simulada con foto fija) y con riesgo
  de confirmar falsos; holdout presentado como ciego; candidato "localización compartida" sin ahorro real; plazo en
  ms hacía `decode()` dependiente del hardware; `device` con los mismos 4 productos en dev y test.
- v2: regla de gate del README sin cambios (objetos/MDE informativos); dataset `public-blur` derivado; M7 diferido;
  B10 condicionado; negativas como control de regresión; `splits.json` explícito; guarda en todos los runners;
  límite por trabajo y `timeBudgetMs` solo si lo fija el usuario → NO APROBADO (4 importantes).
- v3: conteo por objeto + test de signos (≥ 8 discordantes, regla multi-conjunto); B10 solo en `decode()`; variantes
  disco/movimiento; plan B de EAN-8 (< 20 objetos → se aplaza); zxing-cpp 3.1.1 sin `try_harder` (muestra del 10 %:
  localiza 71 %, módulo 5,7 px) → APROBADO.

## v1.2 — 2026-10-10 (segunda verificación independiente)

Resultado: **0 bloqueantes**, 7 importantes, 8 menores, 5 dudas técnicas. Todo aplicado.

- Se elimina el alias de dist-tag `next`: con trusted publishing (OIDC) solo `npm publish` se autentica; `dist-tag`/`deprecate` necesitarían token. Política final: `alpha` → `beta` → `rc` → `latest` (README, F0, F2-F7).
- `@qhago/ai` incluido en el bootstrap de F0.8 (placeholder + trusted publisher propio); sigue el pre-tag global del monorepo.
- Los documentos de fase fijan el pre-tag, no números de versión (changesets decide `0.x.y`).
- Mínimo de ≥ 200 imágenes por escenario para tener ≥ 60 en `test` (F1).
- G2/G3/G5 alineados entre README y fases (ttfr "no peor", `negatives_fp`, "mejor" estadístico en G5).
- `maxInputPixels` = 16 MP en todo el diseño; coordenadas de ruta 2 sin contradicción; peer range `>=0.4.0-0 <1.0.0`.
- Un `ENVIRONMENT` de Emscripten por artefacto (evita top-level await del glue con `node`).
- Opción `engine` (ADR-07) llevada a `DecodeOptions` y a la tabla de configuración; `signal` en `init()`/`start()`; `processingWidth: "native"`.
- Tareas añadidas: pistas de `ENGINE_LOAD_FAILED` (ABI, Vite), e2e de ABI distinta, validación temprana de `canvas.captureStream` en WebKit Linux, fallback si `createImageBitmap` ignora `resizeWidth`, SIMD condicionado a medición, inventario de API completo en F4.1.
- Correcciones menores: numeración de F2, pirámide de tests, ejemplos en ADR-10, `WebAssembly.Module` se clona (no se transfiere), token de bootstrap sobre el scope, tag de zxing-cpp = último estable en F0.3, justificación de Safari 16.4.

## v1.1 — 2026-10-10

Dos pasadas: revisión propia + revisión independiente adversarial (26 hallazgos). Todos se aplicaron; ninguno se descartó.

### Bloqueantes corregidos

| # | Problema | Corrección | Dónde |
|---|---|---|---|
| B1 | Nombre del paquete se decidía en F7 pero se publicaba en F2 | ADR-11 se cierra en F0.7; placeholder en F0.8 | ADR-11, F0 |
| B2 | Trusted publishing no se puede configurar en un paquete inexistente | Bootstrap con placeholder `0.0.0` + token temporal, luego OIDC | F0 diseño, F0.8 |
| B3 | Provenance exige repo público; el repo se publicaba en F7 | Repo público desde F0.7 (dataset en bucket privado) | F0 |
| B4 | changesets en modo pre publica con el pre-tag, no en `next` | Política única de dist-tags (`alpha` → `beta` → `rc` → `latest`, `next` como alias) | README, F0, F2-F7 |
| B5 | `ScanError` se usaba en F2/F3 y se creaba en F4 | Nueva tarea F2.0; F4 solo revisa | F2, F3, F4 |
| B6 | Clips `.y4m` no reproducibles en `<video>` (Firefox/WebKit) | y4m para Chromium + secuencia de frames en canvas para el resto | F6 |
| B7 | Gates estadísticos inalcanzables / no discriminantes con n pequeño | Bootstrap pareado por objeto, umbrales −2 pp / >0, mínimo 60 por escenario, 250 vídeos con split 50/50, cálculo de potencia en F1.9 | README, F1 |
| B8 | G7 circular (exigía evidencias post-publicación antes de publicar) | G7a (sobre RC) y G7b (post 1.0) | README, F7 |
| B9 | Safari 16.4 declarado pero sin forma de probarlo | Sesiones manuales en nube con iOS 16.x + inventario de dispositivos | README, F1, F3, F6 |
| B10 | `attw` sin perfil ESM-only fallaría siempre | `--profile esm-only` | F7 |
| B11 | Plugin IA no cargable en el worker precompilado | `@qhago/ai/worker` + `workerFactory` + `@qhago/scanner/worker-host` | F4, F5 |
| B12 | Fuga de datos: el modelo se entrenaba y evaluaba en `dev` | `dev-train` / `dev-val` por objeto físico | F1, F5 |

### Importantes corregidos

- Node 18/20 fuera de soporte → Node ≥ 22.12 (README, ADR-06, F6, F7); npm ≥ 11.5.1 y Node ≥ 22.14 en el runner de publicación (F0, F7).
- Worker cross-origin desde CDN, Vite dev (`optimizeDeps.exclude`), servicios `/+esm` y workers `iife` sin code-splitting (ADR-06, F4, F5, F6, F7).
- Comprobación de versión ABI JS↔WASM y SSR-safe (ADR-06, F2, F4, F6).
- Flags de Emscripten (sin comodines, `HEAPU8` exportado, `DYNAMIC_EXECUTION=0`, wasm EH) y vistas de memoria invalidadas por growth (F2).
- WASM separado para Node con `stb_image`; WebP no soportado en Node (F2).
- `confidence` 2D usaba datos que ZXing no expone → heurística documentada + inventario de campos (F2).
- `DecodeCandidate` separado de `BarcodeResult`; `validateChecksums: boolean | "strict"`; formatos de 1.0 = 13 (F2).
- Paridad con ZXing nativo definida con blackbox tests del mismo tag (F2).
- Resultados idénticos entre runtimes solo para PNG/raw; JPEG ≥ 98 % (F2).
- Tracker IoU inválido en 1D (posición = línea) → caja expandida + asociación por centro (F3).
- Escalado imposible para códigos nunca leídos → `returnErrors` + barrido rotativo; umbral único `escalateAfterFrames` (F2, F3, F5).
- Heurística de cámara: no descartar "Dual/Triple Wide" (principal en iOS); decisión por capabilities (F3).
- Coordenadas en ruta 2 (frame reducido): `srcWidth/srcHeight/scale` en el protocolo (F3, F5).
- ROI normalizada vs `region` en px, explícito (F2, F3, F4).
- Métricas de main thread y memoria solo en Chromium; procedimiento manual en `android-mid` (F3, F6).
- Presupuesto de CI de PR por job; test de memoria pasa a nocturno (F6).
- Bench nocturno solo sobre `dev`; `test` solo para gates/RC con registro (F1).
- Filtro de licencia en datos de entrenamiento; fondos solo CC0/CC-BY (ADR-09, F5).
- Falsas lecturas: anotación `complete`, muestras negativas, etiquetado sin sesgo hacia un competidor (F1).
- Privacidad de datos de captura (ADR-12).
- `quagga-compat` ampliado (`onProcessed`, `boxes`, `ImageDebug`) para que el ejemplo comprometido sea migrable (F4).
- Polyfill: fixtures grabados de `BarcodeDetector` (no existe en Chrome Linux), soporte de `HTMLVideoElement` (F1, F4).
- Tabla única de configuración (`configure`/`init`/`decode`/`createScanner`) (F4).
- `maxInputPixels` 16 MP por el límite de canvas de iOS (F2).
- Esfuerzos re-estimados: F1 10-13 d, F5 14-20 d + GPU; camino crítico 41-53 d (README).

### Menores corregidos

- `git mv` antes de `git init` → `mv` (F0).
- Placeholder `0.0.0` deprecado para que no se instale por error (F0).
- `sideEffects` con ruta real, `exports` con `worker-host`, `bun` antes de `node` (F7).
- `LICENSE`/`NOTICE` copiados al paquete; NOTICE completo con runtime de Emscripten, libc++ y musl (ADR-09, F7).
- Peer dependency de `@qhago/ai` con rango explícito durante 0.x (F5).
- Vectores AAMVA: no hay oficiales públicos → ejemplos del estándar + sintéticos (F4).
- Tareas añadidas para "Debe" sin cubrir: stream externo, batería, ≤ 2 frames retenidos, `region`, memoria/bundle en bench, guía "Escanear archivos" (F1, F2, F3, F4, F7).

## Estado de aprobación

| Documento | Estado |
|---|---|
| README (índice, DoD, gates, dist-tags) | Aprobado v1.2 |
| 00-decisiones (ADR-01 … ADR-12) | Aprobado v1.2 (ADR-01 y ADR-11 quedan `Propuesta` hasta F0.4 / F0.7, por diseño) |
| F0 … F7 | Aprobados v1.2 |
| F8 | Backlog; se convierte en SDD cuando se priorice |

### Supuestos a confirmar al ejecutar (no bloquean la aprobación)

- Tamaño real del WASM solo-lectores frente al presupuesto de 450 KB gzip (se fija en G2).
- Disponibilidad de `-fwasm-exceptions` sin regresiones en toda la matriz (se mide en F2.1).
- Inyección de cámara en dispositivos reales de BrowserStack/LambdaTest (por eso es manual).
- Licencia del GS1 Barcode Syntax Dictionary (F4.6).
- `canvas.captureStream` en WebKit de Playwright/Linux (F6.3) y opciones de resize de `createImageBitmap` en Safari (F3.2).
- Nombres exactos de tipos de ZXing-C++ según el tag elegido en F0.3.
