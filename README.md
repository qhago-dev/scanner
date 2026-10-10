# Qhago Scanner

> **Estado: alpha, en desarrollo.** La API puede cambiar. No hay versión estable publicada.

Librería de escaneo de códigos de barras y QR para **navegador, Node y Bun**, pensada como alternativa moderna a QuaggaJS:

- Motor **ZXing-C++** compilado a WebAssembly (1D y 2D: EAN/UPC, Code128/39/93, Codabar, ITF, QR, DataMatrix, PDF417, Aztec).
- Procesamiento en **Web Worker** para no bloquear la UI.
- **Fusión multi-frame** y validación para minimizar lecturas falsas.
- Preproceso clásico (contraste local, multiescala) y, de forma opcional, un **detector IA** (`@qhago/ai`).
- Polyfill de `BarcodeDetector` y capa de compatibilidad con Quagga2.

## Objetivos (todavía no medidos)

Superar a Quagga2 en tasa de lectura, latencia y formatos, e igualar o superar a `zxing-wasm` y a `BarcodeDetector` nativo, sin aumentar las lecturas falsas.
**Este README no publica cifras de rendimiento**: solo se citarán resultados del benchmark reproducible de `bench/`, con fecha y commit.

## Estructura

```
packages/engine-wasm   Build de ZXing-C++ + bridge + preproceso → WASM
packages/scanner       @qhago/scanner (TS)
packages/ai            @qhago/ai (detector opcional)
apps/demo              Demo web y herramienta de captura
bench/                 Benchmark contra competidores
training/              Entrenamiento del detector
docs/roadmap-v1/       Roadmap SDD (requerimientos, diseño y tareas por fase)
```

## Desarrollo

```bash
git submodule update --init
bun install
bun run build:wasm   # requiere emsdk (ver packages/engine-wasm/README.md)
bun run build
bun run test
```

## Licencia

MIT. Incluye ZXing-C++ (Apache 2.0) y otras dependencias permisivas: ver [`NOTICE`](./NOTICE).
