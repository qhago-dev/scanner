# Contribuir a Qhago Scanner

Gracias por ayudar. Este documento resume cómo trabajar en el monorepo.

## Entorno

```bash
git submodule update --init
bun install
bun run build:wasm      # requiere emsdk (packages/engine-wasm/README.md)
bun run build
bun run test
```

Requisitos: Bun ≥ 1.2, Node ≥ 22.12, Python 3 (datasets y entrenamiento), emsdk para el motor WASM.

## Antes de abrir un PR

- `bun run lint`, `bun run typecheck` y `bun run test` en verde.
- Si cambias la API pública: `cd packages/scanner && bun scripts/api-report.ts` y revisa el diff de `api/public-api.md`.
- Todo cambio de comportamiento público lleva un changeset: `bun run changeset`.
- Commits convencionales, referenciando la tarea del roadmap si existe (`feat(scanner): F3.4 …`).

## Rendimiento y precisión

Un cambio que afecte a la lectura se mide con `bench/` **sobre el split `dev`** (ver `bench/README.md`):

- `bun run cli.ts --dataset public --split dev` (y `public-blur`, `public-neg`, `device` si los tienes).
- `bun run diff.ts base.json nuevo.json`: **ninguna lectura falsa nueva** (una lectura incorrecta es peor que no leer)
  y ganadas/perdidas por objeto con test de signos.
- `test` solo para gates y cierres de fase (exige `--reason` y queda registrado); `holdout` solo para la release.
- Ningún número entra al README si no viene de `bench/results/` con fecha y commit.

## Datos

No subas fotos con datos personales. Las capturas del dispositivo (`apps/demo/debug-captures/`) y el conjunto `device`
son privados y están en `.gitignore`. Las fuentes de datos se registran con su licencia en `bench/dataset/SOURCES.md`
**antes** de usarlas.

## Conducta

Este proyecto sigue el [Código de conducta](./CODE_OF_CONDUCT.md).
