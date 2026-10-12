# Qhago Scanner

> **Estado: release candidate en preparación.** API congelada (`packages/scanner/api/public-api.md`); falta publicar en npm.

Librería de escaneo de códigos de barras y QR para **navegador, Node y Bun**, pensada como alternativa moderna a QuaggaJS:

- Motor **ZXing-C++** compilado a WebAssembly (1D y 2D: EAN/UPC, Code128/39/93, Codabar, ITF, QR, DataMatrix, PDF417, Aztec).
- Procesamiento en **Web Worker** para no bloquear la UI.
- **Fusión multi-frame** y validación para minimizar lecturas falsas.
- Preproceso clásico (contraste local, multiescala) y, de forma opcional, un **detector IA** (`@qhago/ai`).
- Polyfill de `BarcodeDetector` y capa de compatibilidad con Quagga2.

## Resultados medidos

Benchmark reproducible de `bench/` (2026-10-12, commit `f686758`, split `test` de fotos públicas reales EAN-13/EAN-8 de
ArTe-Lab, KAIST y Muenster; i9-12900H, Bun). Informe: [`bench/results/f10-cierre/`](./bench/results/f10-cierre/).

| Motor | Lee | Lecturas falsas | Desenfocadas | p50 |
|---|---|---|---|---|
| **qhago** (`balanced`) | **80,9 %** | **0** de 818 | **59,4 %** | 20 ms |
| qhago + detector IA (experimental) | 87,0 % | 1 | 62,3 % | 26 ms |
| zxing-wasm 3.1.5 | 71,9 % | 14 | 7,2 % | 17 ms |

qhago − zxing-wasm: **+9,0 pp** (IC 95 % [+5,5; +12,6], comparación pareada por objeto). Sin las fotos de Muenster
(licencia solo de investigación): qhago 74,0 %, zxing-wasm 62,6 %. Fotos > 4 MP: la cola llega a p95 ≈ 0,5 s y
p99 ≈ 0,9 s en escritorio (ver la guía de archivos). El split `test` ya se había usado antes en el desarrollo: es un
control de regresión, no una estimación ciega; la validación con fotos propias del dispositivo está pendiente
(`docs/guias/captura-device.md`). Metodología y resto de conjuntos: `bench/README.md` y el sitio de docs.

## Estructura

```
packages/engine-wasm   Build de ZXing-C++ + bridge + preproceso → WASM
packages/scanner       @qhago/scanner (TS)
packages/ai            @qhago/ai (detector opcional)
apps/demo              Demo web y herramienta de captura
bench/                 Benchmark contra competidores
training/              Entrenamiento del detector
docs/roadmap-v1/       Roadmap SDD (requerimientos, diseño y tareas por fase)
docs-site/             Sitio de documentación (VitePress + TypeDoc)
apps/tarball/          Apps de ejemplo verificadas contra el tarball publicable
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
