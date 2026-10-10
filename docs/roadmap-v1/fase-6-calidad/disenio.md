# Fase 6 — Diseño

## Pirámide de tests

```
                ┌──────────────┐  dispositivos reales (manual por RC)
                │  matriz real │
              ┌─┴──────────────┴─┐  e2e Playwright, cámara fake (PR)
              │       e2e        │
           ┌──┴──────────────────┴──┐  motor en Node/Bun/3 navegadores (PR)
           │      integración       │
        ┌──┴────────────────────────┴──┐  lógica pura TS + C++ host (PR)
        │            unit              │
        └──────────────────────────────┘
```

## Estructura

```
packages/scanner/
├── src/**/*.test.ts               # unit
└── test/
    ├── integration/decode.test.ts # samples + snapshot (node/bun)
    ├── browser/                   # mismo suite vía @vitest/browser o Playwright
    └── fixtures/                  # imágenes pequeñas en git (≤ 5 MB total)
e2e/
├── playwright.config.ts           # proyectos: chromium, firefox, webkit
├── fixtures/videos/<clip>/        # descargados en CI, no en git; cada clip en dos formas:
│   ├── clip.y4m                   #   Chromium (--use-file-for-fake-video-capture)
│   └── frames/0001.png …          #   Firefox/WebKit (shim que dibuja en canvas a su FPS)
└── specs/*.spec.ts
packages/engine-wasm/
├── test/                          # tests nativos (CTest) del bridge/preproceso
└── fuzz/fuzz_read.cpp             # libFuzzer
```

## Cámara simulada por navegador

| Navegador | Mecanismo |
|---|---|
| Chromium | flags `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-video-capture=clip.y4m` |
| Firefox | prefs `media.navigator.permission.disabled: true` + shim de `getUserMedia` → `canvas.captureStream(fps)` de un canvas donde se dibujan los `frames/*.png` del clip (las prefs de stream fake solo dan un patrón sin códigos) |
| WebKit | mismo shim (init script); `HTMLVideoElement.captureStream` no existe en Safari, `canvas.captureStream` sí |

El shim vive en `e2e/support/fake-camera.ts` y también permite simular `NotAllowedError`, `NotFoundError`, 2 cámaras y cambio de dimensiones. Limitación conocida: el shim no ejercita la ruta `MediaStreamTrackProcessor` real con cámara; eso lo cubre Chromium con el flag de vídeo fake y la matriz manual.

## Presupuestos (valores iniciales; se ajustan con datos de F1/F2)

| Métrica | Presupuesto | Herramienta |
|---|---|---|
| JS gzip por entry point | tabla de F4 | size-limit |
| WASM navegador gzip | ≤ 450 KB o el valor fijado al cerrar F2 | script `check-wasm-size` |
| `decode` 1280×720 sin código, `fast` | p50 ≤ 1,2 × `zxing-wasm` en `desktop-ref` (F2) y sin regresión > 10 % vs `main` | tinybench en Node + navegador |
| Main thread por frame (scanner) | media < 4 ms | Performance API en e2e |
| Memoria 10 min (CI) / 30 min (manual, `android-mid`) | crecimiento < 10 % | e2e Chromium / registro manual |
| Main thread por frame en `android-mid` | media < 4 ms (F3) | registro manual por RC |

Regresiones de rendimiento: el job compara con el último resultado de `main` guardado como artefacto; falla si empeora > 10 % en p50.

## Presupuesto de CI de PR (reloj, jobs en paralelo)

| Job | Presupuesto | Depende de |
|---|---|---|
| wasm (caché por hash de `packages/engine-wasm/**`) | 1 min con caché / 8 min sin caché | — |
| typecheck + lint | 2 min | — |
| unit + cobertura + fast-check | 3 min | wasm |
| integración Node 22/24 + Bun | 3 min | wasm |
| integración navegador (Vitest browser, 3 motores) | 5 min | wasm |
| e2e rápida (3 navegadores en paralelo, sin memoria) | 6 min | wasm |
| size-limit + micro-bench | 3 min | wasm |

Camino crítico ≈ wasm + e2e ≈ 7 min con caché. Si un PR toca C++ y no hay caché, se acepta hasta 15 min.

## Fuzzing

- libFuzzer sobre `sa_read` con entradas `(w, h, opts, bytes)` derivadas del input; build host con ASan/UBSan.
- fast-check en TS: entradas arbitrarias a `decode()` (tipos inválidos, dimensiones 0/enormes, buffers cortos) → debe lanzar `ScanError("INVALID_INPUT")`, nunca crashear el worker.

## CSP

Ejemplo `apps/examples/csp-strict` servido con:
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; img-src 'self' blob: data:; media-src 'self' blob: mediastream:
```
El SDK no puede necesitar `unsafe-eval` ni `unsafe-inline`.
