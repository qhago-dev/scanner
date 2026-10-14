# Fase 11 — Demo pública sobre los paquetes publicados

> Revisión v2 (2026-10-13): incorpora la revisión independiente (ver `REVISION.md`).

## Objetivo

Una aplicación web pública que use **`@qhago/scanner` y `@qhago/ai` instalados desde npm** (no del workspace), que
sirva a la vez de:

1. **Escaparate**: cualquiera la abre en el móvil, escanea y ve lo que hace la librería, sin instalar nada.
2. **Plantilla**: se copia con un comando y es un punto de partida real (`npx degit qhago-dev/scanner/showcase`).
3. **Prueba continua del paquete publicado**: si una versión de npm se rompe para un usuario normal (instalación,
   bundler, worker, wasm, modelo IA), CI lo detecta.

## Evidencia de partida (2026-10-13)

| Hallazgo | Consecuencia |
|---|---|
| `apps/demo` depende de `workspace:*` y mezcla demo, captura de dataset, bench en dispositivo, depuración y presentación (1 691 líneas) | No prueba lo publicado ni sirve de plantilla; es una herramienta interna |
| `apps/tarball` prueba el tarball **antes** de publicar; `smoke.yml` instala desde npm pero solo prueba Node y la CDN | Nadie prueba **en un navegador, con cámara y con un bundler** la versión ya publicada |
| `apps/examples/*` son mínimos y también usan `workspace:*` | Tampoco prueban lo publicado |
| `@qhago/scanner@0.1.0-beta.0` y `@qhago/ai@0.1.0-beta.0` están en npm (`latest` = beta) | Ya se puede depender de ellos |
| La cámara exige HTTPS; GitHub Pages lo da y ya hay un workflow de Pages (docs en `/docs/`) | La demo puede vivir en `/demo/` del mismo sitio |
| GitHub Pages no permite cabeceras COOP/COEP | ONNX Runtime corre sin hilos (sin `SharedArrayBuffer`); la IA debe funcionar igual, más lenta |

## Decisión: proyecto nuevo, no modificar `apps/demo`

`apps/demo` sigue siendo el **laboratorio** (lo usan la captura `device` v2, el bench en dispositivo y el vídeo de
presentación) y sigue usando el código local. La demo pública es un proyecto aparte, `showcase/`, **fuera de los
workspaces** de Bun para que la resolución vaya siempre al registro de npm.

## Alcance

1. **`showcase/`**: Vite + TypeScript sin framework (lo más parecido a lo que copiaría un usuario), con su propio
   `package.json` y `package-lock.json` (npm), dependencias fijadas a versiones publicadas.
2. **Funciones** (móvil primero, en español):
   - Escaneo con cámara: overlay con las esquinas, vibración, lista de resultados con copiar y hora.
   - Controles: iniciar/detener, cambiar de cámara, linterna y zoom si el dispositivo los tiene.
   - Leer desde una foto o archivo (`decode()`), con el tiempo de lectura.
   - Interruptor **IA** (`@qhago/ai`, modo `fallback`), cargada solo al activarlo.
   - Selector de formatos: "Productos (EAN/UPC)", "Por defecto", "Todos".
   - Para EAN/UPC: enlace "buscar producto" (Open Food Facts por GTIN). Solo un enlace; la demo no llama a APIs.
   - Pie con la versión instalada de cada paquete (leída de su `package.json` en build) y enlaces a docs y GitHub.
   - Errores (`ScanError`) mostrados con su `code` y el enlace `docsUrl`; ayuda específica para `PERMISSION_DENIED`,
     `NO_CAMERA`, `CAMERA_IN_USE`, `INSECURE_CONTEXT`, `ENGINE_LOAD_FAILED` e `INVALID_INPUT`.
3. **Publicación** en GitHub Pages bajo `/demo/` (mismo artefacto que `/docs/`).
4. **CI** (`showcase.yml`):
   - `npm ci` desde el registro, `typecheck`, `build`.
   - e2e con Playwright en Chromium: lectura de archivo (fixture EAN-13) y cámara simulada
     (`--use-fake-device-for-media-stream` + `--use-file-for-fake-video-capture` con un vídeo del fixture), con y
     sin IA. Con IA se usa `?ai=always` (la IA infiere en cada frame): con `fallback` y un fixture nítido la IA no
     llegaría a ejecutarse y el test no probaría ORT, el modelo ni su worker.
   - Además de en PRs/push que toquen `showcase/`, corre **tras cada Release** (versión recién publicada) y una vez
     por semana con `@latest` (canario: detecta roturas por dependencias transitivas, p. ej. `onnxruntime-web`).
     Tras Release y en el canario un fallo **abre un issue** (la versión ya está publicada: no hay nada que bloquear).
5. **Actualización de versiones**: Dependabot (npm, directorio `/showcase`, semanal) abre PRs con la nueva versión;
   el job de CI las valida.
6. **Documentación**: `showcase/README.md` (cómo copiarla y ejecutarla), enlace "Demo" en el README raíz, en
   `packages/scanner/README.md` y en la barra del sitio de docs.

## Fuera de alcance

- Cambios en `@qhago/scanner` o `@qhago/ai` (si la demo destapa un bug, se abre tarea aparte).
- Modificar o retirar `apps/demo`.
- PWA/instalable, offline, historial persistente, analítica, backend o llamadas a APIs de producto.
- Dominio propio (`qhago.dev`): pendiente del autor; la demo funciona bajo cualquier base (`DEMO_BASE`).
- e2e en Safari/Firefox y en dispositivos reales (manual, ver criterio de aceptación de prueba manual).

## Criterios de aceptación

- [ ] `showcase/` no está en `workspaces`; `npm ci` en una copia limpia instala `@qhago/*` desde
      `registry.npmjs.org` (comprobado en `package-lock.json`: `resolved` apunta al registro).
- [ ] `npx degit qhago-dev/scanner/showcase app && cd app && npm i && npm run dev` funciona sin tocar nada más
      (se verifica en CI copiando `showcase/` a un directorio temporal fuera del repo: `npm ci`, build y e2e de
      humo contra `vite dev`, que es donde rompería el pre-bundling, ADR-06).
- [ ] `npm run build` produce un sitio estático que funciona bajo una subruta (`/demo/`) y en la raíz.
- [ ] e2e en Chromium (CI): archivo → `5901234123457`; cámara simulada → `5901234123457` en ≤ 10 s; con IA
      (`?ai=always`): se piden el `.onnx` y el `ort-wasm*.wasm` y se lee en ≤ 60 s (arranque en frío de ORT en un
      hilo); sin errores en consola. Corre en PR, tras Release y semanal (`@latest`); en la raíz y bajo `/demo/`.
- [ ] La IA no se descarga hasta activarla (e2e: ninguna petición a `.onnx` ni `ort-*.wasm` sin IA).
- [ ] Peso, medido en CI (gzip): JS inicial (scripts de `index.html`) ≤ 60 KB; todo lo que se descarga sin IA
      (JS inicial + worker + motor `.wasm`, que se cargan con `new URL`) ≤ 450 KB.
- [ ] Lighthouse móvil (manual, una vez): accesibilidad ≥ 90.
- [ ] Prueba manual registrada en `showcase/README.md`: Android Chrome y iOS Safari reales leen un EAN-13 con la
      cámara trasera desde la URL pública.
- [ ] La demo está desplegada en Pages en `/demo/` y enlazada desde README raíz, README del paquete y docs.
