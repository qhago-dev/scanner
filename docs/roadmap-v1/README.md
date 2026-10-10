# Roadmap v1 — ScanAI SDK hasta publicación en npm / bun

> Este roadmap **reemplaza** al plan de `docs/sprints/` y a `PHASE_PLAN.md`.
> Se basa en la auditoría del 2026-10-10 (ver "Estado de partida").
> Revisión: v1.2 (2026-10-10) — ver [`REVISION.md`](./REVISION.md).

Cada fase tiene tres documentos SDD:

- `requerimiento.md` — qué y por qué, alcance, fuera de alcance, criterios de aceptación.
- `disenio.md` — cómo: arquitectura, interfaces, decisiones.
- `tareas.md` — tareas atómicas con ID, esfuerzo, archivos y checklist.

Las decisiones transversales están en [`00-decisiones.md`](./00-decisiones.md) (ADRs).

---

## Objetivo del producto

Una librería de escaneo de códigos de barras para **navegador, Node y Bun** que:

1. Sea **mejor que QuaggaJS/Quagga2** en tasa de lectura, latencia y formatos (1D + 2D).
2. Sea **al menos igual que `zxing-wasm` y `BarcodeDetector` nativo** en condiciones normales y **mejor en condiciones adversas** gracias a: preproceso, fusión multi-frame y (opcional) un detector IA.
3. **Nunca devuelva una lectura falsa** con más frecuencia que los competidores (la lectura incorrecta es peor que no leer).
4. Se instale con `npm i` / `bun add` y funcione en Vite, webpack 5, Next.js, Bun y Node con configuración cero o, como máximo, una línea documentada (caso Vite dev, ver ADR-06).

## Plataformas soportadas (fuente única; el resto de documentos remiten aquí)

| Entorno | Versión mínima | Motivo del mínimo |
|---|---|---|
| Chrome / Edge (desktop y Android) | últimas 2 estables | — |
| Firefox | últimas 2 estables + ESR vigente | — |
| Safari macOS / iOS | 16.4 | `OffscreenCanvas` 2D en workers (16.4) y `requestVideoFrameCallback` (15.4); Safari no tiene `MediaStreamTrackProcessor`, así que siempre usa la ruta 2 de F3. Se verifica en dispositivos reales de nube (BrowserStack/LambdaTest, sesión manual) porque los equipos propios ya corren iOS actual |
| Samsung Internet | últimas 2 | — |
| Node | 22.12 (se prueba 22 y 24) | Node 18 y 20 están fuera de soporte a la fecha; desde 22.12 `require(esm)` no necesita flag |
| Bun | 1.2 | — |
| Deno | best effort, sin garantía | — |

`createScanner()` (cámara) solo existe en navegador; en Node/Bun lanza `ScanError("UNSUPPORTED")`.

## Estado de partida (auditoría 2026-10-10)

| Componente | Estado |
|---|---|
| ZXing-C++ → WASM (`core/zxing/`) | Funciona; el bridge solo devuelve texto (sin formato, esquinas ni multi-código) |
| Pipeline Rust (`core/src/pipeline.rs`) | No funciona: `run_*` de `onnx_runner.rs` siempre devuelven `Err` |
| Modelos IA | Ninguno exportado a ONNX; solo `autofocus_best.pth` |
| SDK TS (`sdk/`) | No compila (`tsc`); bugs de serialización y caché en `localStorage` |
| Benchmark | `testScanAI` devuelve `"SIMULATED_RESULT"` |
| README | Publica métricas no medidas |
| Tests / CI | Inexistentes |
| Wrappers móviles | Solo interfaces |

Avance real estimado: **~15 %**.

---

## Definición de "Terminado" (DoD v1.0.0)

La v1.0.0 está lista para publicar cuando **todos** estos puntos están en verde, cada uno con evidencia enlazada (job de CI, reporte de `bench/` o registro de prueba manual).

### Funcional
- [ ] `decode(image)` funciona en navegador (main thread y Worker), Node y Bun según "Plataformas soportadas", con `ImageData`, `ImageBitmap`, `Blob`, `HTMLImageElement`, `HTMLCanvasElement`, `OffscreenCanvas`, `VideoFrame`, objeto `{data,width,height,format}` y, en Node/Bun, `Buffer`/`Uint8Array` PNG/JPEG.
- [ ] `createScanner()` escanea desde cámara en todos los navegadores de "Plataformas soportadas".
- [ ] 13 formatos: Code128, Code39, Code93, Codabar, ITF, EAN-8, EAN-13, UPC-A, UPC-E, QR, DataMatrix, PDF417, Aztec.
- [ ] Multi-código por frame con posición (4 esquinas), formato, texto, bytes crudos y orientación.
- [ ] Fusión multi-frame con consenso configurable y deduplicación.
- [ ] Linterna, zoom, selección de cámara (con heurística de cámara principal), pausa/reanudar, `destroy()` sin fugas.
- [ ] Polyfill compatible con la API `BarcodeDetector` y capa de compatibilidad Quagga2.

### Calidad
- [ ] Benchmark real (F1) publicado y reproducible; el README solo cita números de ese benchmark con fecha y commit.
- [ ] Gates G2 y G3 cumplidos (y G5 si se publica `@qhago/ai`).
- [ ] Tasa de lectura falsa ≤ la del mejor competidor en el dataset real (imágenes y vídeo).
- [ ] Cobertura de tests ≥ 80 % de líneas en `packages/scanner/src`; e2e con cámara simulada en Chromium, Firefox y WebKit.
- [ ] Presupuestos de tamaño, latencia y memoria de F6 cumplidos (los valores definitivos se fijan al cerrar F2 con datos de F1).
- [ ] Fuzzing del bridge WASM: 1 h sin crashes en el job nocturno.
- [ ] Importar el paquete en SSR (Node sin DOM) no lanza errores.

### Empaquetado
- [ ] ESM con `exports` map y tipos; pasa `publint` y `@arethetypeswrong/cli` sin errores.
- [ ] Probado en apps de ejemplo (lista en F7) usando el tarball publicado, no el workspace.
- [ ] Publicado desde CI con provenance (trusted publishing, repo público); instalación verificada con `npm`, `pnpm`, `yarn` y `bun` sobre el RC (G7a) y sobre 1.0.0 (G7b).
- [ ] `LICENSE` (MIT) + `NOTICE` (ZXing-C++, runtime de Emscripten y demás deps) dentro del paquete.

### Documentación
- [ ] Sitio de docs: quick start (5 min), guías por framework, API reference (TypeDoc), migración desde Quagga2, FAQ de permisos de cámara/HTTPS.
- [ ] CHANGELOG generado con changesets; política de versionado semántico y de soporte publicada.

---

## Fases

| # | Fase | Entregable | Depende de | Esfuerzo | Versión | Estado |
|---|------|-----------|-----------|----------|---------|--------|
| 0 | [Saneamiento y base](./fase-0-saneamiento/) | Repo limpio, monorepo, CI, nombre del paquete, pipeline de pre-release | — | 4-5 d | — | Hecha (local; externas pendientes) |
| 1 | [Dataset y benchmark real](./fase-1-benchmark/) | Harness reproducible + baseline de competidores | F0 | 10-13 d (incluye 5-7 persona-días de captura) | — | Tooling hecho; dataset real pendiente (autor) |
| 2 | [Motor de decodificación](./fase-2-motor/) | WASM propio + `decode(image)` universal | F0 (gate G2 requiere F1) | 6-8 d | pre-tag `alpha` | Hecha (G2 vs competidores pendiente de F1) |
| 3 | [Scanner de cámara](./fase-3-camara/) | `createScanner()` en Worker + fusión multi-frame | F2 (gate G3 requiere F1) | 7-9 d | pre-tag `alpha` | Hecha (G3 y matriz de dispositivos pendientes) |
| 4 | [API pública y DX](./fase-4-api-dx/) | API congelada, polyfill, compat Quagga, UI, parsers | F3 | 5-6 d | pre-tag `beta` | Pendiente |
| 5 | [Detector IA opcional](./fase-5-ia/) | `@qhago/ai` (si pasa G5) | F5.1-F5.4: F1 · F5.5+: F4 | 14-20 d + GPU en cloud | `@qhago/ai@0.x` | Pendiente |
| 6 | [Calidad y rendimiento](./fase-6-calidad/) | Tests, e2e, matriz de navegadores, presupuestos, fuzzing | F2-F4 (continuo) | 5-7 d | pre-tag `rc` | Pendiente |
| 7 | [Documentación y release](./fase-7-release/) | Docs, ejemplos, publicación 1.0 | F4, F6 | 4-5 d | `1.0.0` | Pendiente |
| 8 | [Post-1.0](./fase-8-post-1.0/) | React/Vue, Capacitor, RN, nativo | F7 | — | `1.x` | Pendiente |

```
F0 ──► F1 ──────────────(G2, G3 necesitan F1)─────────────► F5.1-F5.4 (entrenamiento)
  └──► F2 ──► F3 ──► F4 ──► F6 ──► F7 ──► 1.0.0 ──► F8              │
                     └──────────────────────────► F5.5+ (integración IA) ─► @qhago/ai
```

**Camino crítico a 1.0 sin IA, 1 dev**: F0 → F1 → F2 → F3 → F4 → F6 → F7 ≈ **41-53 días**.
Con 2 devs (uno hace F1 mientras el otro hace F2-F3): ≈ 32-42 días (G2 espera a que F1 termine, pero F3 avanza en paralelo).

## Política de versiones y dist-tags (fuente única)

changesets en modo pre publica en un dist-tag igual al nombre del pre-tag. Por eso:

| Etapa | Comando | Versiones | dist-tag npm |
|---|---|---|---|
| Placeholder (F0.8) | publicación desde CI con token temporal | `0.0.0` de `@qhago/scanner` y `@qhago/ai`, deprecados con "usa @alpha" | `latest` (inevitable en el primer publish) |
| F2-F3 | `changeset pre enter alpha` | `0.x.y-alpha.N` | `alpha` |
| F4-F5 | `pre exit` → `pre enter beta` | `0.x.y-beta.N` | `beta` |
| F6 | `pre exit` → `pre enter rc` | `0.x.y-rc.N` | `rc` |
| F7 | `pre exit` | `1.0.0` | `latest` |

- **No hay alias `next`**: con trusted publishing (OIDC) solo se autentica `npm publish`; `npm dist-tag` y `npm deprecate` requieren un token, y el pipeline no guarda secretos. Los únicos usos de token son el bootstrap de F0.8 (incluido el `deprecate` del placeholder).
- Las versiones exactas (`0.x.y`) las decide changesets según los bumps acumulados; los documentos de fase solo fijan el **pre-tag**, no el número.
- El modo pre de changesets es global al monorepo: `@qhago/ai` sigue el mismo pre-tag que `@qhago/scanner` mientras ambos estén en 0.x.
La IA (F5) **no bloquea la 1.0**: `@qhago/ai` tiene su propio ciclo de versiones y puede salir después.

## Gates (puntos de decisión con datos)

Las comparaciones son **pareadas** (los dos motores sobre las mismas muestras) y el IC 95 % de la diferencia se calcula con bootstrap pareado por muestra (agrupado por objeto físico).
- "No peor": el límite inferior del IC 95 % de la diferencia es ≥ −2 pp.
- "Mejor": el límite inferior del IC 95 % es > 0.
- Los criterios por escenario solo se evalúan si el escenario tiene ≥ 60 muestras en `test`; si tiene menos, se informa sin gate. F1.9 hace un cálculo de potencia con el baseline y, si los tamaños no alcanzan para detectar una diferencia de 5 pp, se amplía el dataset antes de G2/G3.

| Gate | Cuándo | Condición para avanzar |
|------|--------|-------------------------|
| G1 | Fin F1 | Dataset real con los mínimos de F1; baseline de los competidores medido; hardware de referencia definido |
| G2 | Fin F2 | En imágenes `test`: global y por escenario no peor que `zxing-wasm`; global 1D mejor que Quagga2; false_read_rate y negatives_fp no peores que el mejor competidor |
| G3 | Fin F3 | En vídeos `test`: % de vídeos leídos mejor que `zxing-wasm` frame a frame; ttfr p50 no peor; false_read_rate y negatives_fp no peores; main thread según F3 (Chromium) |
| G5 | Fin F5 | Subconjunto adverso: +10 pp sobre scanner sin IA y "mejor", false_read_rate no peor, latencia según F5 |
| G7a | Pre-1.0, con una `0.x.y-rc.N` publicada | Toda la DoD en verde, verificada sobre el RC (smoke tests e instalación desde `@rc`, `cdn-html` contra `@rc`) |
| G7b | Tras publicar 1.0.0 | Smoke tests contra `@latest`, badge de provenance visible, docs enlazando a 1.0.0 |

Si un gate falla: se registra el resultado en `bench/results/`, se abre una tarea de corrección en la fase y **no** se avanza la versión pública (sí se puede avanzar trabajo de la fase siguiente que no dependa del resultado).

## Convenciones

- Estados de fase: `Pendiente` → `En curso` → `En revisión` → `Hecha`. Actualizar la tabla de arriba.
- IDs de tarea: `F<fase>.<n>` (ej. `F2.3`). Los commits referencian el ID: `feat(scanner): F3.4 fusión multi-frame`.
- Todo cambio de comportamiento público lleva un changeset (desde F0).
- Ningún número de rendimiento entra al README sin venir de `bench/` con commit y fecha.
- El nombre `@qhago/*` es un marcador hasta que F0.7 cierre ADR-11; tras eso se reemplaza en todos los documentos.
