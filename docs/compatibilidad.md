# Matriz de compatibilidad (F6.7)

Estado al **2026-10-10**. Las filas "automático" las cubre CI (o se ejecutaron en local, indicado); las "manual" se
rellenan en la ronda de cada RC en dispositivos reales (BrowserStack/LambdaTest + inventario de F1.8).

| Entorno | Versión probada | `decode()` | `createScanner()` | Ruta de captura | Cómo | Estado |
|---|---|---|---|---|---|---|
| Chromium (Playwright, Linux) | build de Playwright 1.64 | ✔ | ✔ cámara falsa nativa | track-processor | automático (CI + local) | ✔ |
| Firefox (Playwright, Linux) | build de Playwright 1.64 | ✔ | ✔ shim `captureStream` | frame-callback | automático (CI + local) | ✔ |
| WebKit (Playwright, Linux) | build de Playwright 1.64 | ✔ (21 tests) | ✘ no simulable: `play()` sobre `canvas.captureStream` no arranca en WebKit/Linux | — | automático (`decode`, polyfill, host); cámara en Safari real (manual) | ✔ decode · cámara → matriz manual |
| Node | 24.15 (local); 22.14 y 24 (CI) | ✔ | `UNSUPPORTED` (por diseño) | — | automático | ✔ 24 local; 22 en CI |
| Bun | 1.3.12 | ✔ (snapshot ≡ Node en 571 samples) | `UNSUPPORTED` | — | automático | ✔ |
| Chrome Android (gama alta / media / baja) | — | — | — | — | manual | pendiente |
| Samsung Internet | — | — | — | — | manual | pendiente |
| Safari iOS 16.4 / 17 / 18 | — | — | — | — | manual (nube) | pendiente |
| Safari macOS | — | — | — | — | manual | pendiente |
| Edge / Chrome desktop (Windows, macOS) | — | — | — | — | manual | pendiente |
| Deno | — | — | — | — | best effort | sin probar |

## Registro manual por RC en `android-mid`

| RC | Dispositivo | 30 min de memoria (crecimiento) | Main thread por frame (media) | Notas |
|---|---|---|---|---|
| — | — | — | — | pendiente (requiere el dispositivo de referencia de F1.8) |

Automático relacionado: en Chromium, 3 s de escaneo sin *long tasks* en el hilo principal
(`test/camera/perf.test.ts`); 10 min de memoria estable en el workflow nocturno (`soak`).
