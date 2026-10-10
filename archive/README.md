# archive/

Material del plan anterior (ScanAI SDK v0, pipeline Rust + 5 modelos), conservado como referencia.
**Nada de esta carpeta se compila, se publica ni se mantiene.** Reemplazado por `docs/roadmap-v1/`.

| Carpeta | Contenido | Motivo del archivo |
|---|---|---|
| `rust-core/` | Núcleo Rust/wasm-bindgen | ADR-01: un solo WASM Emscripten, orquestación en TS |
| `sdk-old/` | SDK TS anterior | No compilaba; se reescribió en `packages/scanner` |
| `wrappers/` | Interfaces Flutter / React Native / Capacitor | Post-1.0 (F8) |
| `training/` | SR, deblur, perspectiva, autofocus | ADR-03 y ADR-04 |
| `benchmarks-old/` | Runner con resultados simulados | Reescrito en `bench/` (F1) |
| `demo-old/` | Demo anterior | Reescrita en `apps/demo` |
| `docs-old/` | README con métricas no medidas, plan por fases y sprints | Obsoletos: ver `docs/roadmap-v1/` |

El estado completo previo a la reestructuración está en el tarball `scanai-snapshot-2026-10-10.tar.zst` (fuera del repo).
