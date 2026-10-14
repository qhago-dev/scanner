# Fase 12 — Diseño (v2)

## D1 · Rango del peer

```json
"@qhago/scanner": ">=0.1.0-beta.0 <2.0.0 || >=1.0.0-0 <2.0.0"
```

- Primer conjunto: `0.1.0-beta.N` (mismo `x.y.z` que el comparador con prerelease), `0.1.0` y cualquier estable `<2`.
- Segundo conjunto: el comparador `>=1.0.0-0` habilita todas las prereleases de `1.0.0` (`beta`, `rc`). El sufijo
  `-0` es la prerelease más baja posible.
- `<2.0.0` evita prometer compatibilidad con una API que aún no existe. No admite `2.0.0-*`.
- No cubre prereleases de otras minors 0.x (`0.2.0-beta.0`, `0.2.0-rc.0`). El camino previsto no las produce: en
  modo pre todas las versiones salen de `0.1.0` hasta el `major` de la 1.0 (comprobado con `changeset status`: un
  `minor` de `scanner` da `0.1.0-beta.1`). Por tanto, el RC de G7a (`0.x.y-rc.N` en fase 7) será `0.1.0-rc.N`, o
  `1.0.0-rc.N` si ya lleva el `major`; ambos entran (aclarado en `fase-7-release/requerimiento.md`). Si se publicara
  una `0.1.0` estable y después otra prerelease 0.x, la guarda D3 lo detecta al versionar.

Alternativas descartadas:
- `*` o `>=0.1.0-0`: sin el mismo `x.y.z` tampoco admiten prereleases.
- `includePrerelease`: no se puede elegir desde el paquete, depende del gestor.
- Quitar el peer: `aiWorker` importa el host de `@qhago/scanner` y debe ser la misma copia que usa la app.

## D2 · changesets

En `.changeset/config.json`:

```json
"___experimentalUnsafeOptions_WILL_CHANGE_IN_PATCH": { "onlyUpdatePeerDependentsWhenOutOfRange": true }
```

Es la única forma que ofrece changesets 2.x de evitar el `major` forzado. El nombre advierte que puede cambiar en una
patch: la guarda D3 y `release:dry` (que muestra `changeset status`) lo cubren si cambia.

Verificado en un worktree:
- `minor` o `major` de `scanner` en modo `beta` → solo `scanner` (`0.1.0-beta.1` / `1.0.0-beta.1`).
- En modo `rc` → `1.0.0-rc.1`.

## D3 · Guarda `scripts/check-peer.mjs`

- Lee la versión de `packages/scanner` y el peer de `packages/ai`. Usa `semver` (devDependency en la raíz, la misma
  semántica que npm, pnpm y yarn).
- Falla si el rango no admite la versión actual de `scanner` o, mientras sea `< 1.0.0`, las del camino a 1.0:
  `0.1.0-rc.0`, `1.0.0-beta.0`, `1.0.0-rc.0` y `1.0.0`.
- Plan de changesets (`changeset status --output`): falla si `@qhago/ai` sube a `major` sin un changeset propio que
  lo pida. Así se detecta si la opción de D2 cambia o desaparece. Sin changesets pendientes no hay plan y se omite.
- Mensajes accionables: qué versión queda fuera o qué paquete arrastra a cuál.
- Dónde corre:
  - `ci.yml`, job `license` (barato; corre también en la PR «Version Packages», que es donde changesets/action
    versiona);
  - `release.yml`, antes de publicar;
  - `scripts/release.mjs`, antes de versionar (también en `release:dry`) y tras `changeset version`, antes del
    commit.

## D4 · Publicación

Un changeset `patch` para `@qhago/ai` (en modo pre `beta`: `0.1.0-beta.1`). El flujo de siempre:
- `bun run release:dry` en local;
- después, el autor ejecuta `bun run release` (versiona, commitea y hace push) o hace push y deja que el workflow
  Release abra la PR «Version Packages».

Tras publicar:
- el job `showcase` de `release.yml` prueba la combinación publicada;
- Dependabot actualizará `showcase/` a `0.1.0-beta.1`.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| La opción experimental cambia o desaparece al actualizar changesets | Versión de `@changesets/cli` en el lockfile; `release:dry` muestra el plan y la guarda falla si `ai` sale de rango |
| Usuarios con `@qhago/ai@0.1.0-beta.0` y `scanner@1.0.0-rc` | Actualizar `ai` a `0.1.0-beta.1` (nota en el README y el CHANGELOG) |
| pnpm y yarn | Misma semántica de semver: el rango nuevo vale para todos. pnpm y yarn solo avisan, npm falla; `smoke.yml` y `showcase.yml` usan npm |
| Peer `onnxruntime-web ^1.22.0` | Solo admite estables 1.x: el mismo problema aparecería únicamente con una prerelease de ORT. Riesgo aceptado |
