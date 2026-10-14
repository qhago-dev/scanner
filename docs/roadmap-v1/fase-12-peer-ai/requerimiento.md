# Fase 12 — Compatibilidad de `@qhago/ai` con las versiones de `@qhago/scanner`

> Revisión v2 (2026-10-13), con la revisión independiente aplicada (ver `REVISION.md`). Origen: hallazgo de la fase 11 (`showcase/`).

## Problema

`@qhago/ai@0.1.0-beta.0` declara `peerDependencies: { "@qhago/scanner": ">=0.1.0-beta.0" }`. Hay dos defectos,
ambos reproducidos:

| # | Defecto | Evidencia (2026-10-13) |
|---|---|---|
| P1 | **npm rechaza la instalación** con cualquier prerelease de otra versión base de `@qhago/scanner`: en semver, una prerelease solo satisface un rango si algún comparador tiene el mismo `x.y.z` con prerelease. El camino a 1.0 (F7.7) pasa por `1.0.0-rc.N` → `npm i @qhago/scanner@rc @qhago/ai` falla con `ERESOLVE`. | `npm i scanner-0.2.0-beta.0.tgz @qhago/ai@0.1.0-beta.0` → ERESOLVE. `semver -r ">=0.1.0-beta.0" 1.0.0-rc.0` → no satisface. |
| P2 | **changesets publicaría `@qhago/ai@1.0.0` por error.** Por defecto, si un paquete sube `minor` o `major`, sus dependientes por `peerDependencies` suben `major` aunque el rango siga cubriendo la versión nueva. `@qhago/ai` es 0.x con ciclo propio (F5) y no ha superado G5. | `changeset status` con un changeset `minor` solo de `@qhago/scanner` → `@qhago/scanner 0.1.0-beta.1`, `@qhago/ai 1.0.0-beta.1`. Con `major` → ambos `1.0.0-beta.1`. |

F5 (`fase-5-ia/tareas.md`) ya preveía un rango explícito para aceptar prereleases durante 0.x; el que se publicó no
lo cumple. Ningún CI lo detectaba: `smoke.yml` solo instala `@qhago/scanner`, y el monorepo usa `workspace:*`.

## Objetivo

Que cualquier combinación del camino previsto (`0.1.0-beta.N` → `1.0.0-{beta,rc}.N` → `1.x`) se instale con npm sin
avisos ni `--legacy-peer-deps`, y que publicar `@qhago/scanner` no cambie la versión de `@qhago/ai` salvo que haya un
changeset para ella.

## Alcance

1. Rango del peer en `packages/ai/package.json`: `>=0.1.0-beta.0 <2.0.0 || >=1.0.0-0 <2.0.0`.
2. `.changeset/config.json`: `onlyUpdatePeerDependentsWhenOutOfRange: true`. Los dependientes solo suben si la versión
   nueva sale del rango, y en ese caso el fallo es real.
3. Guarda `scripts/check-peer.mjs`:
   - comprueba que el peer de `@qhago/ai` admite la versión actual de `@qhago/scanner` y las del camino a 1.0;
   - comprueba que el plan de changesets no sube `@qhago/ai` a major sin un changeset propio.
   Corre en CI (`ci.yml`, también en la PR «Version Packages»), en `release.yml` antes de publicar y en
   `release.mjs` (antes de versionar, en `release:dry`, y tras `changeset version`, antes del commit).
4. Changeset `patch` de `@qhago/ai` → `0.1.0-beta.1`, que es lo que se publica. `@qhago/scanner` no cambia.
5. Documentación: CHANGELOG (vía changeset) y nota en `packages/ai/README.md` sobre versiones compatibles.

## Fuera de alcance

- Cambiar el código de `@qhago/scanner` o `@qhago/ai`.
- Agrupar los paquetes (`fixed`/`linked`): obligaría a publicar `ai` en cada release de `scanner`.
- Política de versiones posterior a 2.0 (el rango se revisa entonces; la guarda lo recordará).
- Deprecar `@qhago/ai@0.1.0-beta.0` en npm (acción del autor, opcional: no rompe a quien ya lo usa con `0.1.0-beta.x`).

## Criterios de aceptación

- [ ] Con npm, `@qhago/ai` (tarball con el rango nuevo) se instala junto a `@qhago/scanner` `0.1.0-beta.1`,
      `1.0.0-beta.1`, `1.0.0-rc.1` y `1.0.0`, y falla con `2.0.0`.
- [ ] `changeset status` con un changeset `minor` o `major` solo de `@qhago/scanner` (modo pre `beta` y `rc`) no sube
      `@qhago/ai`. Sin la opción de D2, la guarda falla (camino negativo).
- [ ] `node scripts/check-peer.mjs` pasa con el estado actual y falla si el rango no cubre la versión de
      `@qhago/scanner` (comprobado con el rango antiguo).
- [ ] `bun run release:dry` en verde: publicaría `@qhago/ai@0.1.0-beta.1` y nada de `@qhago/scanner`.
- [ ] Tras publicar (autor): `showcase` en CI con `@qhago/ai@0.1.0-beta.1`, verde.
