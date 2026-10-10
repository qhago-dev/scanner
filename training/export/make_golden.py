#!/usr/bin/env python3
"""Golden de @qhago/ai (F5.7): imágenes de validación + detecciones de referencia (ORT CPU, mismo .onnx).

  python3 training/export/make_golden.py --model packages/ai/models/detector.int8.onnx \
      --data training/data/synth/out --out packages/ai/test/fixtures --n 6
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
from models.centernet_lite import decode  # noqa: E402
from train.train_detector import letterbox, load  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", type=Path, required=True)
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--n", type=int, default=6)
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    sess = ort.InferenceSession(str(a.model), providers=["CPUExecutionProvider"])
    recs = [r for r in load(a.data / "labels.jsonl")[:200] if r["objects"]][: a.n]
    golden = []
    for r in recs:
        img = cv2.imread(str(a.data / r["file"]), cv2.IMREAD_GRAYSCALE)
        name = Path(r["file"]).with_suffix(".png").name
        cv2.imwrite(str(a.out / name), img)
        lb, s, px, py = letterbox(img)
        out = sess.run(None, {"input": (lb.astype(np.float32) / 255)[None, None]})
        dets = decode(*(torch.from_numpy(o) for o in out), k=5, thr=0.4)[0]
        golden.append({
            "file": name, "width": img.shape[1], "height": img.shape[0],
            "objects": r["objects"],
            "detections": [
                {"cls": c, "score": round(sc, 4), "corners": ((p - np.float32([px, py])) / s).round(2).tolist()}
                for c, sc, p in dets
            ],
        })
    (a.out / "golden.json").write_text(json.dumps(golden, indent=1))
    print(f"{len(golden)} imágenes → {a.out}")


if __name__ == "__main__":
    main()
