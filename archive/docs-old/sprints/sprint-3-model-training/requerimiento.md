# Sprint 3 — Entrenar los 5 modelos y exportar a ONNX

**Duración estimada**: 3-4 días (incluye ~12h de GPU)
**Prioridad**: Crítico (sin pesos, los modelos son arquitecturas vacías)
**Estado actual**: Arquitecturas definidas en `training/models/`, datos sintéticos en `training/data/`, scripts de training listos pero nunca ejecutados

---

## Requerimiento

Entrenar los 5 modelos de IA desde cero usando 100% datos sintéticos (sin dependencia de datasets con copyright), validar métricas mínimas, y exportar a ONNX cuantizado INT8 con tamaño <9 MB total.

### Modelos a entrenar

| # | Modelo | Dataset | Métrica target | Tamaño cuantizado |
|---|--------|---------|----------------|-------------------|
| 1 | NanoDet Barcode | 100K imágenes sintéticas | mAP@0.5 > 0.85 | <3.5 MB |
| 2 | ESRGAN Tiny | 50K pares low/high-res | PSNR > 30 dB | <0.8 MB |
| 3 | Deblur UNet | 80K pares blur/sharp | PSNR > 28 dB | <1.2 MB |
| 4 | Perspective CNN | 60K imágenes con esquinas | Corner MAE < 3px | <2.0 MB |
| 5 | Autofocus Binary | 40K pares focused/blurred | Accuracy > 92% | <1.5 MB |

### Lo que NO debe hacer

- NO descargar pesos pre-entrenados de Ultralytics (AGPL)
- NO usar datasets con imágenes reales de código de barras scrapeados (riesgo de copyright)
- NO usar ImageNet pre-entrenado para fine-tuning sin verificar términos de uso comercial
