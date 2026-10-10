# Fase 1 — Tareas

## F1.1 — Esquema y herramientas del dataset
**Esfuerzo**: 4h · **Archivos**: `bench/dataset/manifest.schema.json`, `fetch.ts`
- [x] JSON Schema del manifest + validación en CI
- [x] `fetch.ts`: descarga desde almacenamiento externo (R2/S3/Release assets), verifica sha256
- [x] `SOURCES.md` con licencia de cada fuente

## F1.2 — Herramienta de captura y etiquetado
**Esfuerzo**: 1 d · **Archivos**: `apps/demo/collect/`
- [x] Grabar vídeo/foto desde la cámara con metadatos de dispositivo
- [x] Prelectura con 2 motores + herencia de etiqueta desde la foto de referencia limpia + confirmación manual
- [x] Marca `complete` y modo "negativa" (sin códigos)
- [x] Checklist de privacidad por lote (ADR-12)
- [x] Selección de escenarios por checkbox
- [x] Exportar a líneas de `manifest.jsonl`

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
- [x] Mismo manifest que el real, `source: "synthetic"`
- [x] Semilla fija; 13 formatos

## F1.5 — Adaptadores de motores
**Esfuerzo**: 1 d · **Archivos**: `bench/engines/*.ts`
- [x] Quagga2, `zxing-wasm`, `@zxing/library`, `BarcodeDetector`
- [x] `qhago.ts` apuntando al paquete del workspace (se activa al cerrar F2)
- [x] Opciones de cada motor documentadas en el archivo

## F1.6 — Runners
**Esfuerzo**: 1 d · **Archivos**: `bench/runners/`
- [x] Node/Bun para imágenes
- [ ] Navegador con Playwright (Chromium, Firefox, WebKit); vídeos reproducidos frame a frame a su FPS original
- [x] CLI: `bun run bench -- --engines <lista> --split dev|test --kind image|video`

## F1.7 — Métricas y reporte
**Esfuerzo**: 4h · **Archivos**: `bench/metrics.ts`, `bench/report.ts`
- [x] recall, false_read_rate, negatives_fp, latencias, ttfr, bootstrap pareado por objeto
- [x] Memoria pico y bytes descargados por motor
- [x] Tablas separadas sintético / real
- [ ] Markdown + JSON en `bench/results/`
- [x] Workflow nocturno `.github/workflows/bench.yml` (solo `dev`)
- [x] `--split test` exige `--reason` y registra en `bench/results/test-runs.md`

## F1.8 — Hardware de referencia
**Esfuerzo**: 2h · **Archivos**: `bench/HARDWARE.md`
- [x] Elegir y registrar `desktop-ref`, `android-mid`, `ios-ref`
- [x] Inventario de pruebas manuales (≥ 2 Android multicámara, Android gama baja, iPhone actual, iOS 16.x en nube) con presupuesto
- [x] Script para correr el bench en dispositivo real (página servida por HTTPS + resultados subidos como JSON)

## F1.9 — Baseline
**Esfuerzo**: 2h
- [ ] Correr los competidores sobre `test` (BarcodeDetector en corrida manual macOS/Android)
- [ ] Cálculo de potencia con el baseline (¿detecta 5 pp con el n de `test`?); ampliar dataset si no
- [x] Publicar `bench/results/baseline.md` y fijar los umbrales numéricos de G2/G3/G5 en `docs/roadmap-v1/README.md`

## Estado (2026-10-10)

Tooling completo; **falta el dataset real** (F1.3, lo captura el autor con `apps/demo/collect.html`) y, con él, G1.
- Generador sintético reescrito: el anterior dibujaba barras falsas que ningún motor podía leer. Ahora usa el writer de zxing-cpp (13 formatos), 13 escenarios + negativas, etiqueta verificada por ida y vuelta.
- Set de regresión `dataset/zxing` (623 muestras de zxing-cpp/test/samples).
- Baseline en `bench/results/baseline.md` (no real): qhago "mejor" que zxing-wasm, zxing-js y Quagga2 en los tres sets.
- El benchmark encontró 3 bugs del motor (multi-código, invertidos, UPC-A) corregidos en F2.
- Pendiente: runner de vídeo en navegador con la fusión de F3 (se añade en F3.10), memoria pico (solo Chromium), corrida de `BarcodeDetector` en macOS/Android (`apps/demo/bench.html`), cálculo de potencia con datos reales, revisión de licencias de ArTe-Lab/Muenster.
