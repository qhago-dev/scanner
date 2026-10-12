# Inicio rápido

## 1. Con un bundler (Vite, webpack 5, Next.js, Astro, Bun)

```bash
npm i @qhago/scanner      # o: pnpm add / yarn add / bun add
```

```ts
import { decode } from "@qhago/scanner";

const results = await decode(file); // File/Blob, <img>, <canvas>, ImageBitmap, ImageData, VideoFrame…
for (const r of results) console.log(r.format, r.text, r.cornerPoints);
```

Escanear con la cámara:

```ts
import { createScanner } from "@qhago/scanner";

const scanner = createScanner({
  video: document.querySelector("video")!,
  formats: ["ean_13", "ean_8", "upc_a", "code_128", "qr_code"],
});
scanner.on("detect", ({ result }) => console.log(result.text));
await scanner.start(); // pide permiso; requiere HTTPS (o localhost)
```

No hace falta configurar el bundler: el worker y el `.wasm` se resuelven con `new URL(…, import.meta.url)`.
Única excepción: **Vite en modo dev** necesita `optimizeDeps: { exclude: ["@qhago/scanner"] }` (ver
[Bundlers](/guia/bundlers)).

## 2. Desde una CDN, sin bundler

```html
<script type="module">
  import { decode } from "https://cdn.jsdelivr.net/npm/@qhago/scanner@1/dist/browser/index.js";
  const results = await decode(document.querySelector("img"));
</script>
```

Usa la ruta directa a `dist/` (esm.sh y `/+esm` no están soportados). El worker se arranca desde un `Blob`, así que
con CSP hace falta `worker-src blob:` (ver [CSP](/guia/bundlers#csp)).

## 3. Node ≥ 22.12 y Bun

```ts
import { readFile } from "node:fs/promises";
import { decode } from "@qhago/scanner";

const [first] = await decode(await readFile("etiqueta.jpg"), { formats: ["code_128", "qr_code"] });
```

En Node/Bun se aceptan `Buffer`/`Uint8Array` con PNG o JPEG. Si empaquetas tu app para Node/Bun (`bun build`,
esbuild, ncc), copia `node_modules/@qhago/scanner/wasm/qhago_engine_node.wasm` junto al bundle o usa
`configure({ wasmUrl })`.

## Formatos

Por defecto: EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, QR y DataMatrix. Codabar, ITF, Code 93, PDF417 y Aztec
se piden con `formats` (tienen menos protección contra lecturas falsas). Pide solo lo que uses: es más rápido y más
seguro.
