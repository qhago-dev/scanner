# Sprints — Plan de desarrollo ScanAI SDK

Cada sprint contiene 3 documentos: `requerimiento.md`, `disenio.md` (o `disenio-tareas.md`), y `tareas.md`.

| # | Sprint | Estado | Depende de | Esfuerzo | Bloqueante |
|---|--------|--------|------------|----------|------------|
| 1 | [Integrar ZXing-C++ real](./sprint-1-zxing-wasm/) | Pendiente | — | 3-4 días | Sí |
| 2 | [Conectar ONNX Runtime Web](./sprint-2-onnx-inference/) | Pendiente | — | 4-5 días | Sí |
| 3 | [Entrenar 5 modelos IA](./sprint-3-model-training/) | Pendiente | — | 3-4 días | Sí |
| 4 | [Pipeline cámara real](./sprint-4-camera-pipeline/) | Pendiente | 1, 2, 3 | 2-3 días | Sí |
| 5 | [Benchmark real vs QuaggaJS](./sprint-5-benchmark-real/) | Pendiente | 3, 4 | 2 días | No |
| 6 | [Librerías nativas Android/iOS](./sprint-6-native-mobile/) | Pendiente | 1, 2, 3 | 5-7 días | No |
| 7 | [Producción: tests, CI/CD, release](./sprint-7-production/) | Pendiente | 1-6 | 4-5 días | No |

## Orden recomendado de ejecución

```
Sprint 1 (ZXing)  ──┐
                     ├──► Sprint 4 (Cámara) ──► Sprint 5 (Benchmark)
Sprint 2 (ONNX)   ──┤                              │
                     │                              ▼
Sprint 3 (Modelos) ──┘                     Sprint 7 (Producción)
                                                     ▲
                                            Sprint 6 (Nativo)
```

Los sprints 1, 2 y 3 son independientes y pueden ejecutarse en paralelo si hay 3 desarrolladores. El sprint 4 requiere que los 3 anteriores estén completos. El 5 requiere modelos entrenados y cámara funcional. El 6 puede empezar tras 1-3. El 7 es el cierre final.

## Tiempo total estimado

| Camino | Días |
|--------|------|
| Secuencial (1 dev) | 23-30 días |
| Con paralelismo (2 devs) | 15-20 días |
| Mínimo viable (sprints 1-4) | 12-16 días |

## ¿Qué entrega cada sprint?

| Sprint | Entregable verificable |
|--------|------------------------|
| 1 | `decoding.rs` decodifica códigos reales. `make test-core` pasa tests de decodificación. |
| 2 | `onnx_runner.rs` ejecuta inferencia real. Un modelo ONNX de prueba retorna resultados. |
| 3 | 5 archivos `.onnx` cuantizados en `models/`. Métricas dentro de targets. |
| 4 | Demo web funcional: apuntar cámara a un QR → aparece el texto en pantalla. |
| 5 | `benchmark_report.json` con datos reales. README actualizado con números verdaderos. |
| 6 | `.aar` para Android y `.xcframework` para iOS. Demo nativa en ambos. |
| 7 | Paquetes en npm/pub.dev. CI/CD verde. Documentación completa. |
