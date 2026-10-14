# Fase 11 — Diseño (v2)

## Estructura

```
showcase/                     # fuera de "workspaces" (package.json raíz)
├── package.json              # deps fijadas: @qhago/scanner, @qhago/ai, onnxruntime-web; dev: vite, typescript, playwright
├── package-lock.json         # npm (lo que usaría un usuario); resuelve contra registry.npmjs.org
├── index.html
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── main.ts               # arranque, estado de la UI, eventos
│   ├── scanner.ts            # crea/destruye el Scanner según opciones (IA, formatos, cámara)
│   ├── overlay.ts            # dibuja cornerPoints sobre el vídeo (object-fit: cover)
│   ├── results.ts            # lista de resultados, copiar, enlace de producto
│   └── style.css
├── public/fixture.png        # EAN-13 5901234123457 sintético (generado por el proyecto, misma licencia que el repo;
│                             # copia de packages/scanner/test/fixtures/ean13-synthetic.png)
├── e2e/
│   ├── showcase.spec.ts      # archivo, cámara simulada, IA, sin descargas IA por defecto
│   ├── make-video.sh         # genera e2e/.cache/fixture.y4m (no versionado)
│   └── playwright.config.ts
├── scripts/size.mjs          # presupuesto de peso
└── README.md
```

## Decisiones

### D1 · Fuera de workspaces y con npm

Si `showcase/` estuviera en `workspaces`, `bun install` enlazaría `packages/scanner` aunque la versión pedida sea
de npm (la del workspace coincide). Fuera de ellos, y con `npm`, el proyecto es idéntico a uno de usuario.
`biome check .` ya lo incluye (lockfile y `node_modules` fuera) sin cambios en `biome.json`; el `typecheck` raíz
solo recorre workspaces, así que no lo toca. `tsconfig.json` es autónomo (no extiende `../tsconfig.base.json`, que
no existe en una copia con `degit`).

### D2 · Versiones fijadas + Dependabot

`package.json` fija versiones exactas (`"@qhago/scanner": "0.1.0-beta.0"`). Motivo: un rango con prerelease
(`^0.1.0-beta.0`) no sube a `0.2.0-beta.0`, y `"latest"` no es reproducible. Dependabot abre PR semanal; CI la
valida. El canario semanal instala `@latest` (sin lockfile) para detectar roturas antes que Dependabot.

### D3 · Configuración Vite (igual que `apps/examples/ai-vite`)

```ts
export default defineConfig({
  base: process.env.DEMO_BASE ?? "./",
  optimizeDeps: { exclude: ["@qhago/scanner", "@qhago/ai", "onnxruntime-web"] }, // ADR-06 (solo dev)
  worker: { format: "es" },   // el worker de @qhago/ai usa import() dinámico
  build: { target: "es2022" },
  define: { __VERSIONS__: JSON.stringify(versiones leídas de node_modules/@qhago/*/package.json) },
});
```

`base: "./"` permite servirla en cualquier subruta; en Pages se usa `DEMO_BASE=/demo/` (o `/<repo>/demo/` sin
dominio propio, como `DOCS_BASE`).

### D4 · IA bajo demanda

La app importa `@qhago/ai` con `import()` **en la app** (ADR-06 prohíbe `import()` dinámico dentro del paquete,
no en la aplicación del usuario). Al activar la IA: `scanner.destroy()` y se crea otro con
`workerFactory: aiWorker, plugins: [aiDetector({ when: "fallback" })]`. Sin IA no se descarga ORT ni el modelo
(criterio verificado en e2e observando peticiones).

Sin COOP/COEP (Pages): ORT usa WASM de un hilo. La demo usa `backend: "wasm"` (el default; WebGPU pesa más y para
este modelo rara vez compensa) y muestra "WASM, 1 hilo" o "WASM multihilo" según `crossOriginIsolated`, para que la
latencia percibida tenga explicación. `?ai=always` cambia `when` a `"always"` (diagnóstico y e2e).

### D5 · Flujo de la UI

- Estados: `inactivo → pidiendo permiso → escaneando ⇄ pausado → detenido`, más `error`.
- `detect`: añade resultado (formato, texto, hora, botón copiar; si es EAN/UPC, enlace
  `https://world.openfoodfacts.org/product/<gtin>`), vibra 40 ms y resalta el overlay.
- `track`/`lost`/`candidate`: alimentan el overlay (esquinas verdes; candidatas en gris).
- Duplicados: el mismo texto no se añade de nuevo en 3 s (el tracker ya agrupa por `trackId`; esto evita
  repetir al volver a enfocar).
- Archivo: dos entradas, «Elegir foto» (`accept="image/*"`, galería o archivo) y «Hacer foto» (además
  `capture="environment"`, que en móvil abre la cámara y no deja elegir de la galería), más «Imagen de ejemplo» →
  `decode(file, { formats, strategy: "thorough" })` (con IA si está activa).
- Errores: `ScanError` → `code`, mensaje y enlace `docsUrl`, con ayuda específica para `PERMISSION_DENIED` (cómo
  reactivar el permiso), `NO_CAMERA`, `CAMERA_IN_USE`, `INSECURE_CONTEXT`, `ENGINE_LOAD_FAILED` e `INVALID_INPUT`.
  `start()` emite `error` y además rechaza: la UI muestra el evento e ignora el rechazo.

### D6 · e2e

Playwright con Chromium, servidor `vite preview` sobre el `dist`:

- **Archivo**: `setInputFiles(fixture.png)` → lista contiene `5901234123457`, con enlace a Open Food Facts; también «Imagen de ejemplo» con formatos «Productos».
- **Cámara simulada**: lanzar Chromium con `--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream`,
  `--use-file-for-fake-video-capture=e2e/.cache/fixture.y4m`. El `.y4m` lo genera `e2e/make-video.sh` (copia
  adaptada de `packages/scanner/scripts/make-fake-video.sh`, sin depender de `packages/`: 640×480, 15 fps, 2 s, el
  código se desplaza 4 px/frame) a partir de `public/fixture.png`; se versiona el script, no el vídeo (~14 MB). En
  CI ffmpeg se instala con `apt-get` (no viene en ubuntu-latest).
- **IA**: `?ai=always` + interruptor: se espera a que se pidan el `.onnx` y el `ort-wasm*.wasm`, a la lectura
  (≤ 60 s, arranque en frío de ORT sin hilos) y 3 s más de inferencias sin errores. No demuestra que la lectura
  venga por la ruta de IA (si la cascada lee, la IA no añade nada): prueba que ORT, el modelo y el worker de
  `@qhago/ai` cargan y corren con lo publicado. La tasa de lectura de la IA la mide `bench/`. En las pruebas sin IA,
  ninguna petición a `*.onnx`/`ort-*`.
- **Consola**: falla si hay `pageerror` o `console.error`.
- **Subruta**: con `DEMO_BASE=/demo/` el mismo e2e corre sobre el build servido bajo `/demo/`. Con `E2E_DEV=1` corre
  la prueba `@smoke` contra `vite dev`.
- **Peso**: `scripts/size.mjs` (gzip): JS inicial (scripts y `modulepreload` de `index.html`) ≤ 60 KB; lo alcanzable
  desde él sin pasar por recursos de IA (worker del scanner + motor `.wasm`, cargados con `new URL`) ≤ 450 KB. Un
  recurso es de IA si es de ORT o el modelo, o referencia a uno de ellos. Medido: 27 KB y 366 KB.

### D7 · CI y despliegue

- `showcase.yml`:
  - `on: pull_request/push` con `paths: showcase/**` → `npm ci`, typecheck, build, size, e2e.
  - `on: workflow_call` (desde `release.yml`, en paralelo al smoke) con inputs `scanner` y `ai`: changesets no
    agrupa los paquetes (`fixed`/`linked` vacíos), así que `release.yml` exporta la versión publicada de cada uno;
    el que no se publicó va a `@latest`. Instala con reintentos (12 × 30 s, propagación del registro, como
    `smoke.yml`), build y e2e. No hace commit. En un workflow llamado `github.event_name` es el del llamador: el modo
    se decide por los inputs.
  - `on: schedule` semanal (y `workflow_dispatch`): `npm i @qhago/scanner@latest @qhago/ai@latest` sin lockfile,
    build y e2e (canario).
  - Job `report`: si falla tras Release o en el canario, abre un issue (si no hay ya uno abierto con el mismo título).
  - Prueba de plantilla (solo PR/push): copia `showcase/` a `$RUNNER_TEMP/app` (fuera del repo), comprueba que el
    lockfile resuelve `@qhago/scanner` contra `registry.npmjs.org`, `npm ci`, build y `E2E_DEV=1 npm run e2e`.
- Despliegue: `docs.yml` pasa a llamarse **Pages** (`pages.yml`) y construye ambos (`_site/docs` y `_site/demo`) en
  cada disparo (el artefacto es único); se dispara también con `paths: showcase/**`. Las rutas salen de
  `actions/configure-pages` (`base_path`, `base_url`): con dominio propio `/docs/` y `/demo/`, sin él
  `/<repo>/docs/` y `/<repo>/demo/`, sin entrada manual. La demo se construye desde su lockfile (lo publicado), nunca
  del workspace.
- `.github/dependabot.yml`: ecosistema npm, directorio `/showcase`, semanal, agrupando `@qhago/*`.

### D8 · Accesibilidad y móvil

`<video playsinline muted>`; botones con texto y `aria-label`; resultados en `aria-live="polite"`; contraste AA;
diseño de una columna con el vídeo arriba (4:3 / 100vw) y controles grandes (≥ 44 px).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| La cámara simulada de Chromium no enfoca/mueve: el e2e de cámara solo prueba la tubería, no la tasa de lectura | Aceptado: la tasa de lectura la mide `bench/`; aquí se prueba la integración |
| ORT sin hilos es lento en móvil y la IA parece "colgada" | Modo `fallback` (solo si no lee), indicador "IA cargando/activa" y backend mostrado |
| Dependabot deshabilitado en el repo | Habilitarlo es acción del autor (`acciones-externas.md`); mientras tanto, el canario semanal cubre las versiones nuevas |
| El peer `@qhago/scanner >=0.1.0-beta.0` de `@qhago/ai` no lo satisface una prerelease de otra minor (`0.2.0-beta.0`): semver solo acepta prereleases del mismo `x.y.z` | Fuera de alcance (no se tocan los paquetes): el showcase lo detectará con ERESOLVE en la Release que lo provoque; tarea aparte para ampliar el rango del peer |
| Pages aún no habilitado | Igual que docs: acción externa del autor, ya listada en `acciones-externas.md` |
| `degit` sobre subcarpeta depende de un servicio externo | Alternativa documentada: `git clone --depth 1` + `cp -r showcase` |
