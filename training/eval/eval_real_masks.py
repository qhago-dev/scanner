#!/usr/bin/env python3
"""Detector en fotos reales con máscaras (F5.8): ArTe-Lab 1D extended (CC BY 3.0, 365 imágenes, clase 1D).

  python3 training/eval/eval_real_masks.py --model packages/ai/models/detector.int8.onnx \
      --root <carpeta>/1d_barcode_extended_plain

Cada componente conexa de la máscara = un código; sus esquinas = minAreaRect. mAP@0.5 de la clase 1D y error de
esquinas (÷ lado). Las detecciones de otras clases no cuentan como falsos positivos de 1D.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from eval.metrics import evaluate  # noqa: E402
from models.centernet_lite import decode  # noqa: E402
from train.train_detector import canonical, letterbox  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", type=Path, required=True)
    ap.add_argument("--root", type=Path, required=True)
    ap.add_argument("--min-area", type=int, default=150)
    a = ap.parse_args()
    sess = ort.InferenceSession(str(a.model), providers=["CPUExecutionProvider"])
    preds, gts = [], []
    for mask_path in sorted((a.root / "Detection").glob("*.png")):
        img = cv2.imread(str(a.root / "Original" / mask_path.name), cv2.IMREAD_GRAYSCALE)
        mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
        if img is None or mask is None:
            continue
        lb, s, px, py = letterbox(img)
        n, lab, stats, _ = cv2.connectedComponentsWithStats((mask > 127).astype(np.uint8))
        g = []
        for k in range(1, n):
            if stats[k, cv2.CC_STAT_AREA] < a.min_area:
                continue
            ys, xs = np.nonzero(lab == k)
            box = cv2.boxPoints(cv2.minAreaRect(np.stack([xs, ys], 1).astype(np.float32)))
            g.append((0, canonical(box.astype(np.float32)) * s + np.float32([px, py])))
        out = sess.run(None, {"input": (lb.astype(np.float32) / 255)[None, None]})
        d = decode(*(torch.from_numpy(o) for o in out), thr=0.2)[0]
        preds.append([x for x in d if x[0] == 0])
        gts.append(g)
    m = evaluate(preds, gts, 1)
    m["images"] = len(gts)
    m["codes"] = sum(len(g) for g in gts)
    print(json.dumps(m))


if __name__ == "__main__":
    main()
