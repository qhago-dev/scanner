# Guía: escanear archivos (borrador F4.8 — se publica en F7.5)

`decode()` acepta lo que el usuario sube o arrastra: `File`/`Blob`, `ArrayBuffer`/`Uint8Array` (PNG/JPEG/WebP/GIF/BMP
en navegador; PNG/JPEG en Node/Bun), `<img>`, `<canvas>`, `ImageBitmap`, `ImageData`, `VideoFrame` y `RawImage`.

```ts
import { decode } from "@qhago/scanner";

input.addEventListener("change", async () => {
  for (const file of input.files ?? []) {
    const results = await decode(file, { formats: ["qr_code", "ean_13"], strategy: "thorough" });
    console.log(file.name, results.map((r) => r.text));
  }
});
```

## Elegir la estrategia

| Caso | Opción |
|---|---|
| Captura de pantalla, código nítido | `strategy: "fast"` |
| Foto de móvil (por defecto) | `strategy: "balanced"` |
| Foto difícil: lejos, borrosa, invertida, varios códigos | `strategy: "thorough"` |

## Imágenes grandes

- El límite por defecto es 16 MP (`maxInputPixels`), el máximo de canvas en iOS Safari. Por encima, `decode()` lanza
  `INVALID_INPUT`; reduce la imagen antes (`createImageBitmap(file, { resizeWidth: 4000 })`) o sube el límite fuera de iOS.
- Si sabes dónde está el código, pasa `region` (píxeles de la imagen): es más rápido y evita falsos positivos.
- `timeBudgetMs` corta la cascada si una imagen tarda demasiado (útil en lotes).

## Lotes

- En el navegador, `decode()` usa un worker interno: la UI no se bloquea. Procesa en serie (`for … of` con `await`)
  para no acumular imágenes decodificadas en memoria.
- En Node/Bun, el motor es síncrono dentro de la llamada; para paralelizar, usa `worker_threads`/`Bun.Worker` con
  una instancia por hilo.
- Usa `signal` (AbortController) para cancelar un lote al cerrar el diálogo.

## Varias páginas / PDF

PDF no está soportado directamente. Renderiza cada página con [pdf.js](https://mozilla.github.io/pdf.js/) en un
canvas (escala 2× para códigos pequeños) y pasa el canvas a `decode()`.

## Contenido

Los parsers de `@qhago/scanner/parsers` interpretan el texto: `parseGS1` (GS1-128, DataMatrix GS1), `parseQRContent`
(URL, WiFi, vCard…), `parseAAMVA` (licencias PDF417) y `parseISO15434`.
