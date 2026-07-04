# ScanAI SDK — Guía de Entrenamiento de Modelos

## Requisitos

- Python 3.10+
- PyTorch 2.1+ con CUDA (recomendado) o CPU
- 16GB+ RAM
- GPU con 8GB+ VRAM (recomendado para entrenamiento completo)

```bash
cd training
pip install -r requirements.txt
```

---

## 1. Dataset sintético

El dataset se genera automáticamente durante el entrenamiento. Opcionalmente puedes pre-generarlo:

```python
from data.synthetic_barcodes import (
    BarcodeDetectionDataset,
    SuperResolutionDataset,
    DeblurDataset,
    PerspectiveDataset,
    AutoFocusDataset,
)

# Generar dataset de detección
ds = BarcodeDetectionDataset(
    num_samples=100000,
    image_size=(320, 320),
    num_classes=4,
    augment=True,
)
```

---

## 2. Entrenar modelos

### Detector (NanoDet)

```bash
python train/train_detector.py \
    --num-samples 100000 \
    --batch-size 64 \
    --epochs 100 \
    --lr 1e-3 \
    --amp \
    --output-dir ./checkpoints/nanodet
```

**Métricas esperadas:**
- mAP@0.5: >0.90
- Tiempo inferencia: <5ms (GPU mobile)

### Super-Resolución (ESRGAN Tiny)

```bash
python train/train_sr.py \
    --num-samples 50000 \
    --batch-size 32 \
    --epochs 50 \
    --lr-g 1e-4 \
    --output-dir ./checkpoints/esrgan
```

**Métricas esperadas:**
- PSNR: >30 dB
- Tamaño modelo cuantizado: <1 MB

### Deblur CNN

```bash
python train/train_deblur.py \
    --num-samples 80000 \
    --batch-size 32 \
    --epochs 80 \
    --lr 1e-4 \
    --output-dir ./checkpoints/deblur
```

**Métricas esperadas:**
- PSNR: >28 dB
- Tamaño modelo cuantizado: <1.5 MB

### Corrección de Perspectiva

```bash
python train/train_perspective.py \
    --num-samples 60000 \
    --batch-size 64 \
    --epochs 60 \
    --lr 1e-3 \
    --output-dir ./checkpoints/perspective
```

**Métricas esperadas:**
- Corner MAE: <3px
- Tamaño modelo cuantizado: <2.5 MB

### Autofocus Classifier

```bash
python train/train_autofocus.py \
    --num-samples 40000 \
    --batch-size 64 \
    --epochs 40 \
    --lr 1e-3 \
    --output-dir ./checkpoints/autofocus
```

**Métricas esperadas:**
- Accuracy: >95%
- Tamaño modelo cuantizado: <1.5 MB

---

## 3. Exportar a ONNX

```bash
python export/export_all_onnx.py \
    --checkpoints ./checkpoints \
    --output-dir ./onnx_models \
    --quantize
```

Esto genera archivos `.onnx` (FP32 y INT8) para cada modelo.

---

## 4. Entrenamiento con datos propios

Si tienes imágenes reales de códigos de barras:

1. Anota las imágenes con bounding boxes (formato YOLO o COCO)
2. Convierte al formato esperado por el dataset
3. Crea una clase dataset propia que herede de `torch.utils.data.Dataset`
4. Pasa tu dataset al script de entrenamiento correspondiente

```python
# Ejemplo: dataset propio para detección
from torch.utils.data import Dataset
import torch

class CustomBarcodeDataset(Dataset):
    def __init__(self, annotation_path: str, image_dir: str):
        self.annotations = load_annotations(annotation_path)
        self.image_dir = image_dir

    def __len__(self):
        return len(self.annotations)

    def __getitem__(self, idx):
        ann = self.annotations[idx]
        image = load_image(f"{self.image_dir}/{ann['file']}")
        # ... transform to tensor format
        return image_tensor, targets
```

---

## 5. Tips de entrenamiento

- **Usa `--amp`** para entrenamiento con precisión mixta (2-3x más rápido)
- **Aumenta batch size** si tu GPU lo permite
- **Monitorea overfitting**: compara train loss vs val loss
- **Early stopping**: si val loss no mejora en 10-20 epochs
- **Data augmentation**: el dataset sintético ya incluye augmentación, pero puedes agregar más en tu dataset propio
