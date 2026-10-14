# Fase 12 — Tareas

| ID | Tarea | Archivos | Estado |
|---|---|---|---|
| T12.1 | Rango del peer (D1) | `packages/ai/package.json` | Hecha |
| T12.2 | Opción de changesets (D2) + verificación con `changeset status` en worktree | `.changeset/config.json` | Hecha |
| T12.3 | Guarda `check-peer.mjs` (rango + plan de changesets; `semver` dev) en CI, Release y `release.mjs` | `scripts/check-peer.mjs`, `package.json`, `.github/workflows/{ci,release}.yml`, `scripts/release.mjs` | Hecha |
| T12.4 | Changeset `patch` de `@qhago/ai` + nota en README; aclaración del RC en fase 7 | `.changeset/ai-peer-range.md`, `packages/ai/README.md`, `fase-7-release/requerimiento.md` | Hecha |
| T12.5 | Verificación: npm con tarballs, `release:dry`, criterios | `tareas.md` | Hecha |

Commit local por tarea con convención `F12.<n>`; sin push salvo que el autor lo pida.

## Verificación (2026-10-13)

| Criterio | Evidencia |
|---|---|
| npm con el tarball real de `packages/ai` (peer nuevo) | `scanner` 0.1.0-beta.1 ✅ · 1.0.0-beta.1 ✅ · 1.0.0-rc.1 ✅ · 1.0.0 ✅ · 2.0.0 ERESOLVE (esperado). Antes: 0.2.0-beta.0 → ERESOLVE con el peer antiguo |
| changesets no arrastra a `ai` | `minor` de `scanner` → solo `scanner 0.1.0-beta.1`; `major` → `scanner 1.0.0-beta.1`; modo `rc` + `major` → `scanner 1.0.0-rc.1`. Sin la opción: la guarda falla (`ai → 1.0.0-beta.1`) |
| Guarda | Pasa con el estado actual; falla con el rango antiguo (no admite 1.0.0-beta.0, 1.0.0-rc.0) |
| `bun run release:dry` | ✅ lint, build, typecheck, tests, publint, attw; plan: solo `@qhago/ai 0.1.0-beta.1` |
| `showcase` con `@qhago/ai@0.1.0-beta.1` | Tras publicar (autor): job `showcase` de `release.yml` |

## Publicar (autor)

```bash
bun run release          # versiona (@qhago/ai 0.1.0-beta.1), commitea y hace push; el workflow Release publica
```

Alternativa: `git push` y mergear la PR «Version Packages» que abre el workflow Release.
