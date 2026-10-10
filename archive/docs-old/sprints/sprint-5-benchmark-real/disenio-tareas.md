# Sprint 5 — Diseño y tareas

## T5.1 — Reparar el runner.js

**Esfuerzo**: 3h
**Archivos**: `benchmarks/compare_quaggajs/runner.js`

- [ ] Reemplazar `testScanAI()` que retorna `"SIMULATED_RESULT"` por llamada real a `AIScanner.processImage()`
- [ ] Inicializar el SDK una vez, procesar todas las imágenes en batch
- [ ] Cargar modelos ONNX desde disco local (no CDN, para evitar latencia de red)
- [ ] Manejar timeout: si tarda >5s, marcar como fallo
- [ ] Guardar resultados intermedios cada 100 imágenes (resiliencia)

## T5.2 — Reparar el dataset generator

**Esfuerzo**: 2h
**Archivos**: `benchmarks/dataset/generate.py`

- [ ] Probar `python generate.py --num-images 5000`
- [ ] Verificar que los 10 directorios se crean con 500 imágenes cada uno
- [ ] Verificar que los JSON ground truth tienen el texto correcto
- [ ] Agregar más variación dentro de cada escenario

## T5.3 — Ejecutar y medir QuaggaJS

**Esfuerzo**: 2h

- [ ] Instalar `@ericblade/quagga2` (versión mantenida, MIT)
- [ ] Configurar QuaggaJS para mismos formatos 1D que ScanAI
- [ ] Ejecutar sobre las 5,000 imágenes
- [ ] Nota: QuaggaJS no soporta 2D — medir solo en 1D para comparación justa

## T5.4 — Ejecutar y medir ScanAI

**Esfuerzo**: 3h

- [ ] Ejecutar ScanAI sobre las mismas 5,000 imágenes
- [ ] Medir latencia por etapa (autofocus, detección, deblur, etc.)
- [ ] Identificar cuellos de botella

## T5.5 — Generar reporte

**Esfuerzo**: 3h

- [ ] Completar `MetricsCalculator` en `metrics.js`
- [ ] Generar tabla comparativa por escenario
- [ ] Generar gráficos de barras (éxito y latencia)
- [ ] Actualizar `README.md` con resultados reales (reemplazar proyecciones)
- [ ] Si no se alcanzan targets, documentar gaps y plan de mejora

## T5.6 — Medir consumo de batería (móvil)

**Esfuerzo**: 2h

- [ ] Usar `navigator.getBattery()` API para medir nivel antes/después
- [ ] Escanear continuamente por 10 minutos con cada motor
- [ ] Medir drenaje de batería (% / hora)
- [ ] Comparar ScanAI (con tracking) vs QuaggaJS (sin tracking)
