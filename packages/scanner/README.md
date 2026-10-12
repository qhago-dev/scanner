# @qhago/scanner

> API congelada para 1.0 (`api/public-api.md`). Documentación: https://qhago.dev/docs/

Lectura de códigos de barras y QR en **navegador, Node y Bun** con ZXing-C++ compilado a WebAssembly.

```bash
npm i @qhago/scanner      # o: pnpm add / yarn add / bun add
```

```ts
import { decode } from "@qhago/scanner";

const results = await decode(file); // File/Blob, <img>, <canvas>, ImageBitmap, ImageData, VideoFrame…
for (const r of results) console.log(r.format, r.text, r.cornerPoints);
```

En Node/Bun acepta `Buffer`/`Uint8Array` con PNG o JPEG:

```ts
import { readFile } from "node:fs/promises";
import { decode } from "@qhago/scanner";

const [first] = await decode(await readFile("label.png"), { formats: ["code_128", "qr_code"] });
```

- Formatos: Aztec, Codabar, Code39, Code93, Code128, DataMatrix, EAN-8, EAN-13, ITF, PDF417, QR, UPC-A, UPC-E.
  Por defecto se buscan EAN/UPC, Code128, Code39, QR y DataMatrix; el resto se pide con `formats`.
- En el main thread del navegador el trabajo se hace en un Web Worker interno.
- Vite en modo dev: añade `optimizeDeps: { exclude: ["@qhago/scanner"] }`. Node/Bun empaquetado (`bun build`,
  esbuild): copia `wasm/qhago_engine_node.wasm` junto al bundle o usa `configure({ wasmUrl })`.
- Medido (2026-10-12, commit `f686758`, fotos públicas reales): lee el 80,9 % con 0 lecturas falsas frente al 71,9 %
  y 14 falsas de zxing-wasm ([metodología](https://qhago.dev/docs/benchmark)).

Licencia MIT. Incluye ZXing-C++ (Apache-2.0): ver `NOTICE`.
