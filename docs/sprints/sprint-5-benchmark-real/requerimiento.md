# Sprint 5 — Benchmark real vs QuaggaJS

**Duración estimada**: 2 días
**Prioridad**: Media (necesario para validar claims comerciales)
**Depende de**: Sprint 3 (modelos), Sprint 4 (cámara pipeline)

---

## Requerimiento

Ejecutar el benchmark reproducible del `README.md` con datos reales: 5,000 imágenes en 10 escenarios, midiendo tasa de éxito, latencia, y consumo de batería tanto para ScanAI como para QuaggaJS. Reemplazar todos los placeholders `"SIMULATED_RESULT"` del `runner.js` actual.

### Lo que debe hacer

1. Generar las 5,000 imágenes con `benchmarks/dataset/generate.py` (ya existe)
2. Ejecutar ScanAI y QuaggaJS sobre cada imagen con timeout de 5s
3. Medir latencia con `performance.now()` para cada decodificación
4. Comparar resultado contra ground truth del JSON
5. Calcular métricas: success rate, precision, recall, F1, latencia p50/p95/p99
6. Generar reporte HTML/Markdown con tablas y gráficos

### Criterios de aceptación

- [ ] El benchmark corre sin intervención manual (`npm run benchmark`)
- [ ] Los resultados de ScanAI son reales (no simulados)
- [ ] Se cumple o se acerca a los targets: 2× más rápido, +30% éxito en adverso
- [ ] El reporte incluye breakdown por escenario
- [ ] Si no se alcanzan los targets, se documenta por qué y qué falta
