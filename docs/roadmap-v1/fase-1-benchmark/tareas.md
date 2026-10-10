# Fase 1 — Tareas

## F1.1 — Esquema y herramientas del dataset
**Esfuerzo**: 4h · **Archivos**: `bench/dataset/manifest.schema.json`, `fetch.ts`
- [ ] JSON Schema del manifest + validación en CI
- [ ] `fetch.ts`: descarga desde almacenamiento externo (R2/S3/Release assets), verifica sha256
- [ ] `SOURCES.md` con licencia de cada fuente

## F1.2 — Herramienta de captura y etiquetado
**Esfuerzo**: 1 d · **Archivos**: `apps/demo/collect/`
- [ ] Grabar vídeo/foto desde la cámara con metadatos de dispositivo
- [ ] Prelectura con 2 motores + herencia de etiqueta desde la foto de referencia limpia + confirmación manual
- [ ] Marca `complete` y modo "negativa" (sin códigos)
- [ ] Checklist de privacidad por lote (ADR-12)
- [ ] Selección de escenarios por checkbox
- [ ] Exportar a líneas de `manifest.jsonl`

## F1.3 — Recolección
**Esfuerzo**: 5-7 persona-días · **Archivos**: `bench/dataset/real/`
- [ ] ≥ 1 500 imágenes, ≥ 250 vídeos, ≥ 3 dispositivos
- [ ] ≥ 200 imágenes por escenario (para ≥ 60 en `test`); ≥ 80 por formato principal y ≥ 30 por cada formato restante
- [ ] ≥ 150 imágenes y ≥ 10 vídeos negativos
- [ ] PDF417/AAMVA y etiquetas de envío solo con datos sintéticos impresos (ADR-12)
- [ ] Split `dev`/`test` estratificado y congelado (las fotos del mismo objeto físico van al mismo split, para no filtrar información)
- [ ] Revisión manual de 100 etiquetas al azar

## F1.4 — Generador sintético corregido
**Esfuerzo**: 3h · **Archivos**: `bench/dataset/synthetic/generate.py`
- [ ] Mismo manifest que el real, `source: "synthetic"`
- [ ] Semilla fija; 13 formatos

## F1.5 — Adaptadores de motores
**Esfuerzo**: 1 d · **Archivos**: `bench/engines/*.ts`
- [ ] Quagga2, `zxing-wasm`, `@zxing/library`, `BarcodeDetector`
- [ ] `qhago.ts` apuntando al paquete del workspace (se activa al cerrar F2)
- [ ] Opciones de cada motor documentadas en el archivo

## F1.6 — Runners
**Esfuerzo**: 1 d · **Archivos**: `bench/runners/`
- [ ] Node/Bun para imágenes
- [ ] Navegador con Playwright (Chromium, Firefox, WebKit); vídeos reproducidos frame a frame a su FPS original
- [ ] CLI: `bun run bench -- --engines <lista> --split dev|test --kind image|video`

## F1.7 — Métricas y reporte
**Esfuerzo**: 4h · **Archivos**: `bench/metrics.ts`, `bench/report.ts`
- [ ] recall, false_read_rate, negatives_fp, latencias, ttfr, bootstrap pareado por objeto
- [ ] Memoria pico y bytes descargados por motor
- [ ] Tablas separadas sintético / real
- [ ] Markdown + JSON en `bench/results/`
- [ ] Workflow nocturno `.github/workflows/bench.yml` (solo `dev`)
- [ ] `--split test` exige `--reason` y registra en `bench/results/test-runs.md`

## F1.8 — Hardware de referencia
**Esfuerzo**: 2h · **Archivos**: `bench/HARDWARE.md`
- [ ] Elegir y registrar `desktop-ref`, `android-mid`, `ios-ref`
- [ ] Inventario de pruebas manuales (≥ 2 Android multicámara, Android gama baja, iPhone actual, iOS 16.x en nube) con presupuesto
- [ ] Script para correr el bench en dispositivo real (página servida por HTTPS + resultados subidos como JSON)

## F1.9 — Baseline
**Esfuerzo**: 2h
- [ ] Correr los competidores sobre `test` (BarcodeDetector en corrida manual macOS/Android)
- [ ] Cálculo de potencia con el baseline (¿detecta 5 pp con el n de `test`?); ampliar dataset si no
- [ ] Publicar `bench/results/baseline.md` y fijar los umbrales numéricos de G2/G3/G5 en `docs/roadmap-v1/README.md`
