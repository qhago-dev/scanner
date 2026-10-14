# Fase 11 — Tareas

| ID | Tarea | Esfuerzo | Archivos | Estado |
|---|---|---|---|---|
| T11.1 | Esqueleto `showcase/` fuera de workspaces: Vite + TS, deps fijadas de npm, `package-lock.json`; biome/tsc del monorepo no lo rompen | S | `showcase/{package.json,vite.config.ts,tsconfig.json,index.html}`, `biome.json` | Hecha |
| T11.2 | Escaneo con cámara: estados, overlay, resultados (copiar, hora, dedupe 3 s, enlace de producto), cámara/linterna/zoom | M | `showcase/src/{main,scanner,overlay,results}.ts`, `style.css` | Hecha |
| T11.3 | Archivo/foto con `decode()` + botón "imagen de ejemplo"; selector de formatos; errores con `docsUrl` | S | `showcase/src/main.ts`, `public/fixture.jpg` | Hecha |
| T11.4 | IA bajo demanda (import() en la app), indicador de backend; versiones en el pie | S | `showcase/src/scanner.ts`, `vite.config.ts` | Hecha |
| T11.5 | e2e Playwright: archivo, cámara simulada (y4m generado con ffmpeg), IA, sin descargas IA, consola limpia; `size.mjs` | M | `showcase/e2e/*`, `showcase/scripts/size.mjs` | Hecha |
| T11.6 | `showcase.yml` (PR/push, `workflow_call` tras Release, semanal `@latest`, prueba de plantilla fuera del repo) y llamada desde `release.yml` | S | `.github/workflows/{showcase,release}.yml` | Hecha |
| T11.7 | Pages: `docs.yml` → `pages.yml` con `/docs/` y `/demo/`; `dependabot.yml` | S | `.github/workflows/pages.yml`, `.github/dependabot.yml` | Hecha (despliegue: acción del autor) |
| T11.8 | Docs: `showcase/README.md` (degit, ejecutar, prueba manual), enlaces en README raíz, del paquete y nav de docs; `acciones-externas.md` (Dependabot, Pages) | S | varios `README.md`, `docs-site/.vitepress/config.mts`, `docs/release/acciones-externas.md` | Hecha |
| T11.9 | Verificación final: criterios de `requerimiento.md` (locales); los que dependen del autor (Pages, móvil real, Lighthouse) quedan marcados como externos | S | `tareas.md` | Hecha (ver abajo) |

## Checklist por tarea

- Cambios mínimos fuera de `showcase/` (solo workflows, enlaces y config de lint).
- `npm run typecheck && npm run build && npm run e2e` en `showcase/` pasan antes de cerrar cada tarea de código.
- Commit local por tarea con convención `F11.<n>`; sin push salvo que el autor lo pida.

## Verificación (2026-10-13, local)

| Criterio | Estado |
|---|---|
| Fuera de `workspaces`; `resolved` de `@qhago/*` → `registry.npmjs.org` | ✅ (88/88 entradas del lockfile) |
| Plantilla fuera del repo (`npm ci`, build, `vite dev`) | ✅ local con `E2E_DEV=1`; la copia en `$RUNNER_TEMP` la hace el job `template` (CI) |
| Build en raíz y bajo `/demo/` | ✅ e2e completo (5/5) en ambos |
| e2e Chromium: archivo, cámara ≤ 10 s, IA (`.onnx` + `ort-wasm*.wasm`, ≤ 60 s), consola limpia | ✅ 5/5 |
| IA no se descarga sin activarla | ✅ (0 peticiones de IA en las pruebas sin IA) |
| Peso: JS inicial ≤ 60 KB; sin IA ≤ 450 KB (gzip) | ✅ 26,9 KB; 365,8 KB |
| `biome check .` y `tsc` del showcase | ✅ |
| CI tras Release y canario semanal | Pendiente de la primera ejecución en GitHub |
| Despliegue en Pages `/demo/`, enlaces | Enlaces ✅; despliegue: acción del autor (`acciones-externas.md` §13b) |
| Lighthouse móvil ≥ 90, Android/iOS reales | Externo (autor): tabla en `showcase/README.md` |
