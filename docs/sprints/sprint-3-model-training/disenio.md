# Sprint 3 — Diseño: Pipeline de entrenamiento

## Flujo de entrenamiento (por modelo)

```
┌────────────────────┐
│ synthetic_barcodes  │  Genera datos on-the-fly en cada epoch
│ .py (Dataset class) │  Sin almacenar 100K imágenes en disco
└─────────┬──────────┘
          │ PyTorch DataLoader (batch=32-64)
          ▼
┌────────────────────┐
│ Model (PyTorch)     │  Arquitectura definida en training/models/
│ + Optimizer (AdamW) │  + Scheduler (CosineAnnealing)
│ + Loss function     │
└─────────┬──────────┘
          │ Training loop (50-100 epochs)
          │ Validation cada epoch
          │ Early stopping en val_loss
          ▼
┌────────────────────┐
│ Checkpoint .pth     │  Guardar mejor modelo por val_loss
└─────────┬──────────┘
          │ export_all_onnx.py
          ▼
┌────────────────────┐
│ ONNX FP32           │  torch.onnx.export(opset=13)
└─────────┬──────────┘
          │ onnxruntime.quantization.quantize_dynamic
          ▼
┌────────────────────┐
│ ONNX INT8            │  Peso reducido ~4×, misma precisión ±1%
└────────────────────┘
```

## Configuración de hardware

- **GPU recomendada**: NVIDIA RTX 3060+ (12 GB VRAM) o cloud (AWS g5.xlarge)
- **RAM**: 32 GB mínimo (los datasets son sintéticos, no cargan todo en RAM)
- **Disco**: ~10 GB para checkpoints intermedios
- **Tiempo total estimado**: ~12 horas de GPU para los 5 modelos

## Hiperparámetros por modelo

| Modelo | Batch | Epochs | LR inicial | LR final | Optimizer | Loss |
|--------|-------|--------|-----------|----------|-----------|------|
| NanoDet | 64 | 100 | 1e-3 | 1e-6 | AdamW | BCE + SmoothL1 |
| ESRGAN | 32 | 50 | 1e-4 G / 1e-4 D | - | Adam | L1 + VGG + Adversarial |
| Deblur | 32 | 80 | 1e-4 | 1e-6 | AdamW | L1 + Edge |
| Perspectiva | 64 | 60 | 1e-3 | 1e-6 | AdamW | Wing Loss |
| Autofocus | 64 | 40 | 1e-3 | 1e-6 | AdamW | BCE |

## Validación de calidad del dataset sintético

Antes de entrenar, verificar que el generador sintético produce datos realistas:

1. **Detección**: ¿Los códigos son distinguibles del fondo? ¿El bounding box cubre el código?
2. **Super-res**: ¿El downscale 2× con BILINEAR produce pérdida realista de detalle?
3. **Deblur**: ¿Los kernels de blur sintético se parecen al blur de cámara real?
4. **Perspectiva**: ¿Las esquinas ground truth son correctas después del warp?
5. **Autofocus**: ¿El blur gaussiano es un proxy razonable para desenfoque real?

## Scripts a ejecutar

```bash
cd training

# 1. Verificar dataset sintético
python -c "
from data.synthetic_barcodes import BarcodeDetectionDataset
ds = BarcodeDetectionDataset(num_samples=100, augment=True)
img, targets = ds[0]
print(f'Image shape: {img.shape}, Boxes: {targets[\"boxes\"].shape}')
# Guardar 10 muestras para inspección visual
"

# 2. Entrenar (en orden de dependencia)
python train/train_detector.py    --epochs 100 --output-dir ./checkpoints/nanodet
python train/train_sr.py          --epochs 50  --output-dir ./checkpoints/esrgan
python train/train_deblur.py      --epochs 80  --output-dir ./checkpoints/deblur
python train/train_perspective.py --epochs 60  --output-dir ./checkpoints/perspective
python train/train_autofocus.py   --epochs 40  --output-dir ./checkpoints/autofocus

# 3. Exportar ONNX cuantizado
python export/export_all_onnx.py --checkpoints ./checkpoints --output-dir ../models --quantize

# 4. Verificar tamaños
ls -lh ../models/*.onnx
```
