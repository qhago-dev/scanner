# Fuentes de datos del benchmark (F1.1)

Cada fuente se registra con su licencia **antes** de usarla. Las no comerciales (`research-only`) solo
sirven para evaluar; nunca para entrenar modelos publicados (ADR-09). Privacidad: ADR-12.

| Fuente | Tipo | Licencia | Uso permitido | Estado |
|---|---|---|---|---|
| Capturas propias (`apps/demo/collect.html`) | real | own | evaluación + entrenamiento | pendiente de captura |
| `zxing-cpp/test/samples` | regresión (no cámara real) | Apache-2.0 | regresión, no gates | en uso (`dataset/zxing`) |
| Generador sintético (`dataset/synthetic/generate.py`) | sintético | own | complemento, separado en reportes | en uso |
| ArTe-Lab 1D Medium Barcode Dataset | real | _verificar_ | — | por evaluar |
| Muenster BarcodeDB | real | _verificar_ | — | por evaluar |
