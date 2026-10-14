# Qhago Scanner — demo pública

Demo de [`@qhago/scanner`](https://www.npmjs.com/package/@qhago/scanner) y
[`@qhago/ai`](https://www.npmjs.com/package/@qhago/ai): escanea con la cámara o lee desde una foto, en el navegador.
Pruébala en **https://qhago.dev/demo/** (desde el móvil).

Usa los paquetes **publicados en npm** (no el código del monorepo). Por eso sirve también de plantilla: Vite +
TypeScript, sin framework.

## Usarla como plantilla

```bash
npx degit qhago-dev/scanner/showcase mi-app
cd mi-app
npm i
npm run dev        # http://localhost:5173 (la cámara funciona en localhost; en otra máquina hace falta HTTPS)
```

Sin `degit`: `git clone --depth 1 https://github.com/qhago-dev/scanner && cp -r scanner/showcase mi-app`.

Lo que conviene copiar a tu proyecto:

- **`vite.config.ts`**: `optimizeDeps.exclude` (sin él, el worker y el `.wasm` no cargan en `vite dev`) y
  `worker.format: "es"` (el worker de `@qhago/ai` lo necesita).
- **`src/scanner.ts`**: `createScanner`, `decode()` y la IA cargada con `import()` **solo al activarla** (así no se
  descargan ONNX Runtime ni el modelo, ~4 MB, si no se usan).
- **`onnxruntime-web`** es dependencia directa: `@qhago/ai` lo declara como `peerDependency`.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Sitio estático en `dist/`. Funciona en cualquier subruta (`base: "./"`); `DEMO_BASE=/demo/` la fija |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run size` | Presupuesto de peso (gzip): JS inicial ≤ 60 KB; todo lo que se descarga sin IA ≤ 450 KB |
| `npm run e2e` | Playwright (Chromium) sobre `vite preview`: foto, cámara simulada y IA. Antes: `bash e2e/make-video.sh` (ffmpeg) y `npx playwright install chromium` |

`?ai=always` hace que la IA corra en cada frame aunque el motor clásico lea (diagnóstico; lo usa el e2e).

## Notas

- GitHub Pages no permite cabeceras COOP/COEP: ONNX Runtime corre en un solo hilo (la demo lo indica). La IA va en
  modo `fallback`: solo actúa cuando el motor clásico no lee.
- Las versiones van fijadas (`0.1.0-beta.0`, sin `^`): un rango con prerelease no sube a la siguiente minor.
  Dependabot abre una PR semanal y el CI (`.github/workflows/showcase.yml`) la valida contra lo publicado.
- El enlace «Buscar producto» abre Open Food Facts con el GTIN. La demo no llama a ninguna API: todo se procesa en
  el dispositivo.

## Prueba manual en dispositivos reales

Leer un EAN-13 con la cámara trasera desde la URL pública. Registrar fecha, versión (pie de la demo) y resultado.

| Fecha | Dispositivo / navegador | Versión | Cámara | Foto | IA | Notas |
|---|---|---|---|---|---|---|
| _pendiente_ | Android, Chrome | | | | | |
| _pendiente_ | iPhone, Safari | | | | | |

Lighthouse móvil (accesibilidad ≥ 90): _pendiente_.
