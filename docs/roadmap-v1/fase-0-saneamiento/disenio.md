# Fase 0 — Diseño

## Estructura objetivo

Ver ADR-10. Movimientos concretos:

| Origen | Destino | Motivo |
|---|---|---|
| `core/src/*.rs`, `core/Cargo.*` | `archive/rust-core/` | ADR-01 |
| `core/zxing/zxing_bridge.cpp`, `zxing-wrapper*.js` | `packages/engine-wasm/src/` | Base del motor F2 |
| `core/zxing/zxing-cpp/` (vendorizado) | git submodule `packages/engine-wasm/vendor/zxing-cpp` fijado al último release estable en el momento de F0.3 (los nombres de tipos usados en F2 —`Barcode`/`Result`, `ReaderOptions`— se ajustan a ese tag) | Reproducibilidad, tamaño del repo |
| `sdk/src/*.ts` | `packages/scanner/src/` (se reescribe en F2-F3) | Reutilizar tipos |
| `sdk/src/onnx-bridge.ts` | `archive/` | Se reemplaza en F5 |
| `wrappers/*` | `archive/wrappers/` | F8 |
| `demo/` | `apps/demo/` (sin `captures/`, sin `mobilenetv2-7.onnx`) | Limpieza |
| `benchmarks/` | `bench/` | F1 |
| `training/models/{esrgan_tiny,deblur_cnn,perspective_cnn,autofocus_classifier}.py`, `train_{sr,deblur,perspective,autofocus}.py` | `archive/training/` | ADR-03, ADR-04 |
| `training/checkpoints/`, `demo/captures/`, `*.pyc` | solo tarball (fuera de git) | Binarios |
| `benchmarks/compare_quaggajs/runner.js` (`testScanAI` simulado) | se reescribe en F1; el original va a `archive/` | Resultados falsos |

## Build del WASM (reproducible)

- Script `packages/engine-wasm/build.sh` que no dependa de rutas locales (hoy el Makefile usa `/home/louiso/emsdk`).
- Versión de emsdk fijada en `packages/engine-wasm/.emsdk-version`.
- En CI: acción `mymindstorm/setup-emsdk` (o imagen `emscripten/emsdk:<versión>`) con caché.
- Alternativa local: `docker run --rm -v $PWD:/src emscripten/emsdk:<ver> ./build.sh`.

## Herramientas raíz

```jsonc
// package.json (raíz)
{
  "private": true,
  "workspaces": ["packages/*", "apps/*", "bench"],
  "scripts": {
    "build": "bun run --filter '*' build",
    "typecheck": "bun run --filter '*' typecheck",
    "lint": "biome check .",
    "test": "bun run --filter '*' test"
  }
}
```

- Lint/format: Biome (un solo binario, rápido). TS `strict: true`.
- `.editorconfig`, `CODEOWNERS` opcional.

## Prueba de ADR-01 (1 día)

Medir sobre 50 imágenes de `zxing-cpp/test/samples`:

| Criterio | Build propio | `zxing-wasm` |
|---|---|---|
| Tamaño `.wasm` gzip (solo lectores) | | |
| Tiempo medio `ReadBarcodes` 640×480 | | |
| ¿Permite preproceso en el mismo heap? | | |
| ¿Permite fijar opciones (`tryHarder`, `binarizer`, `downscale`)? | | |
| Mantenimiento (actualizar ZXing) | | |

Si el build propio no gana en al menos tamaño o en capacidad de preproceso, se adopta `zxing-wasm` como dependencia y F2 se reduce.

## CI

```
.github/workflows/ci.yml
  jobs:
    wasm:    setup-emsdk (cache) → build.sh → subir artefacto
    check:   needs: wasm → descarga artefacto → bun install → typecheck → lint → test
             (desde F2 los tests de decode necesitan el .wasm; si los .cpp no cambiaron, se reutiliza el artefacto cacheado por hash)
    license: license-checker --production --failOn 'GPL;AGPL;LGPL;SSPL'
```

## Pipeline de pre-release (necesario desde F2.9)

npm solo permite configurar **trusted publishing (OIDC)** en un paquete que ya existe. Por eso:

1. **Bootstrap (una vez, F0.8)**: publicar placeholders `0.0.0` de `@qhago/scanner` y `@qhago/ai` (README "en desarrollo") con un *granular access token* de corta duración sobre el scope, desde CI. Esto reserva los nombres (ADR-11).
2. Configurar en npmjs.com el trusted publisher de **cada paquete** (repo + workflow `release.yml`) y **revocar el token**.
3. Desde ahí, `release.yml` publica sin secretos: `permissions: id-token: write`, npm CLI ≥ 11.5.1 y Node ≥ 22.14 en el runner. Con trusted publishing desde un repo **público**, la provenance se genera automáticamente.
4. changesets en modo pre según la política de dist-tags del README (`alpha` → `beta` → `rc`, sin alias `next`). El paso a `latest` solo ocurre en F7.
5. En el mismo job de bootstrap (aún con el token temporal): `npm deprecate <pkg>@0.0.0 "Paquete en desarrollo: usa @alpha"`, para `@qhago/scanner` y `@qhago/ai`. El token es granular, de corta duración y con permiso de escritura sobre el **scope** (no puede limitarse a un paquete que aún no existe); se revoca al terminar.

```
.github/workflows/release.yml
  on: push a master (changesets/action) | workflow_dispatch (dry-run)
  jobs:
    release: build wasm → build ts → tests → changeset publish (dist-tag = pre-tag; latest tras pre exit)
```
