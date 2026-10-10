# Fase 1 — Diseño

## Estructura

```
bench/
├── dataset/
│   ├── manifest.schema.json
│   ├── real/
│   │   ├── manifest.jsonl          # una línea por muestra
│   │   ├── images/                 # NO en git (descarga con script)
│   │   └── videos/
│   ├── synthetic/
│   │   └── generate.py             # el actual, corregido
│   └── fetch.ts                    # descarga + verifica sha256
├── engines/
│   ├── types.ts                    # interfaz Engine
│   ├── qhago.ts
│   ├── quagga2.ts
│   ├── zxing-wasm.ts
│   ├── zxing-js.ts
│   └── native.ts                   # BarcodeDetector (solo navegador)
├── runners/
│   ├── node.ts                     # imágenes en Node/Bun
│   └── browser/                    # página + Playwright
├── metrics.ts
├── report.ts
└── results/
```

## Manifest (una muestra)

```json
{
  "id": "real-000123",
  "file": "images/000123.jpg",
  "sha256": "…",
  "kind": "image",
  "codes": [{ "format": "ean_13", "text": "7750182000123", "corners": [[x,y],…] }],
  "complete": true,
  "scenarios": ["low_light", "perspective"],
  "device": "Pixel 7 / Galaxy A14 / iPhone 12…",
  "resolution": [1280, 720],
  "source": "own-capture | <dataset público>",
  "license": "CC-BY-4.0 | own | research-only",
  "split": "dev | test"
}
```

`codes` es una lista: una muestra puede tener varios códigos (escenario `multi`); en las negativas es `[]` con `complete: true`. `corners` es opcional (se usa en F5). `complete` indica que todos los códigos visibles están etiquetados.
Para vídeos, `codes` lista los códigos que aparecen en algún momento del clip; opcionalmente `firstVisibleMs` por código para calcular ttfr desde que el código entra en cuadro.

## Fuentes de datos

1. **Capturas propias** (mayor peso): 3-5 móviles de gama baja/media/alta, productos reales (supermercado, farmacia, pantallas) y, para envíos y PDF417/AAMVA, impresiones con datos sintéticos (ADR-12). Herramienta: página `apps/demo/collect` que graba vídeo + permite marcar el texto esperado.
2. **Datasets públicos**: evaluar licencia de cada uno antes de usar (p. ej. ArTe-Lab 1D Barcode, Muenster BarcodeDB, colecciones de QR "in the wild"). Registrar en `bench/dataset/SOURCES.md`.
3. **Samples de ZXing-C++** (`test/samples`, Apache 2.0): sirven como regresión, no como benchmark principal.

Etiquetado: el texto esperado se propone leyendo con **al menos 2 motores** (ZXing-C++ nativo con `tryHarder` en una foto de referencia nítida del mismo código + otro motor) y se confirma a mano. Truco útil: por cada código, sacar primero una foto "limpia" de referencia (lectura segura) y luego las difíciles del mismo objeto; la etiqueta se hereda de la limpia. Las muestras que ningún motor lee se etiquetan a mano (son las más valiosas).

## Interfaz de motor

```ts
export interface Engine {
  name: string;
  version: string;
  init(): Promise<void>;
  decodeImage(img: ImageInput, formats: Format[]): Promise<Detected[]>;
  // vídeo: el runner entrega frames en orden a su FPS real
  createVideoSession?(formats: Format[]): {
    pushFrame(frame: ImageInput, tMs: number): Promise<Detected[]>;
    close(): void;
  };
  dispose(): Promise<void>;
}
```

Para vídeo, los motores sin sesión propia se evalúan frame a frame al mismo FPS de decodificación que ScanAI (mismo presupuesto de cómputo); la primera lectura correcta cuenta como emitida.

Cada motor se configura con sus **mejores opciones razonables** documentadas (ej. Quagga2 con `locate: true`, readers de los formatos de la muestra; ZXing con `tryHarder`). Ser justos con los competidores da credibilidad.

## Métricas

- `recall_sample = muestras con todos los códigos esperados leídos / muestras con códigos`.
- `recall_code = códigos esperados leídos / códigos esperados`.
- `false_read_rate = (lecturas con texto incorrecto + lecturas extra en muestras complete + lecturas en negativas) / lecturas totales`. Se compara texto **y** formato (EAN-13 vs UPC-A equivalentes se normalizan: UPC-A = EAN-13 con 0 inicial).
- `negatives_fp = muestras negativas con al menos una lectura / muestras negativas`.
- Vídeo: `ttfr` = tiempo desde `firstVisibleMs` (o el primer frame) hasta la primera lectura correcta **emitida** (para ScanAI, tras la fusión); si nunca lee → `∞` (cuenta como fallo; se reporta % leídos y ttfr solo sobre los leídos).
- IC 95 % por **bootstrap pareado** (2 000 remuestreos, unidad = objeto físico): en cada remuestreo se calcula la diferencia entre motores sobre las mismas muestras.
- Memoria pico (Chromium: `performance.measureUserAgentSpecificMemory` en página con COOP/COEP; WASM: `memory.buffer.byteLength`) y bytes descargados por motor (suma de JS + WASM + modelos, desde la Resource Timing API).
- Los resultados sintéticos y reales se reportan en tablas separadas.
- Latencia: 3 rondas de calentamiento descartadas; se reporta p50/p95/p99.

## Reporte

`report.ts` genera Markdown con: tabla global, tabla por escenario, tabla por formato, latencias y entorno (CPU, navegador, versión de cada motor, commit). Se versiona el JSON en `bench/results/`.
