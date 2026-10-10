"""Métricas del detector (F5.8): mAP@0.5 (cajas alineadas a ejes derivadas de las esquinas) y error de esquinas.

preds: por imagen, lista de (cls, score, corners[4,2]); gts: por imagen, lista de (cls, corners[4,2]).
Error de esquinas = distancia media entre esquinas emparejadas / lado medio del código (mínimo sobre los 4
desplazamientos cíclicos, porque el orden canónico puede rotar).
"""

from __future__ import annotations

import numpy as np


def box(c: np.ndarray) -> np.ndarray:
    return np.array([c[:, 0].min(), c[:, 1].min(), c[:, 0].max(), c[:, 1].max()])


def iou(a: np.ndarray, b: np.ndarray) -> float:
    x1, y1, x2, y2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua > 0 else 0.0


def corner_error(p: np.ndarray, g: np.ndarray) -> float:
    side = np.mean([np.linalg.norm(g[i] - g[(i + 1) % 4]) for i in range(4)])
    return min(np.mean(np.linalg.norm(np.roll(p, k, 0) - g, axis=1)) for k in range(4)) / max(side, 1e-6)


def evaluate(preds, gts, num_classes: int, thr: float = 0.5) -> dict:
    aps, cerrs = [], []
    per_class = {}
    for c in range(num_classes):
        dets = [(i, s, box(p), p) for i, ds in enumerate(preds) for (k, s, p) in ds if k == c]
        dets.sort(key=lambda d: -d[1])
        gt = {i: [(box(g), g) for (k, g) in gs if k == c] for i, gs in enumerate(gts)}
        n_gt = sum(len(v) for v in gt.values())
        if n_gt == 0:
            continue
        used = {i: [False] * len(v) for i, v in gt.items()}
        tp = []
        for i, _, b, p in dets:
            best, bj = 0.0, -1
            for j, (gb, _) in enumerate(gt[i]):
                o = iou(b, gb)
                if o > best and not used[i][j]:
                    best, bj = o, j
            if best >= thr:
                used[i][bj] = True
                tp.append(1)
                cerrs.append(corner_error(p, gt[i][bj][1]))
            else:
                tp.append(0)
        tp = np.array(tp, np.float32)
        if len(tp) == 0:
            aps.append(0.0)
            per_class[c] = 0.0
            continue
        ctp = np.cumsum(tp)
        rec = ctp / n_gt
        prec = ctp / np.arange(1, len(tp) + 1)
        ap = 0.0
        for r in np.linspace(0, 1, 101):  # AP interpolado a 101 puntos (COCO)
            ap += prec[rec >= r].max() if (rec >= r).any() else 0.0
        ap /= 101
        aps.append(ap)
        per_class[c] = round(float(ap), 4)
    return {
        "mAP50": round(float(np.mean(aps)) if aps else 0.0, 4),
        "ap_per_class": per_class,
        "corner_err": round(float(np.mean(cerrs)) if cerrs else float("nan"), 4),
    }
