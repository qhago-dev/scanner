# Dataset real (privado)

No se versiona (ADR-12). `bun run dataset/fetch.ts` lo descarga desde el bucket privado
(`BENCH_DATASET_URL`) y verifica sha256. Las muestras se capturan con `apps/demo/collect.html`
y se añaden como líneas a `manifest.jsonl` (esquema en `../manifest.schema.json`).

Mínimos para G1 (ver F1): 1 500 imágenes, 250 vídeos, ≥ 200 imágenes por escenario,
≥ 80 por formato principal y ≥ 30 por el resto, ≥ 150 imágenes y ≥ 10 vídeos negativos, ≥ 70 % `complete`.
