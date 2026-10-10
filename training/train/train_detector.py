#!/usr/bin/env python3
"""Entrenamiento de CenterNet-lite (F5.3).

  python3 training/train/train_detector.py --data training/data/synth/out --out training/runs/detector-v1 --epochs 30

Datos: labels.jsonl de training/data/synth_det.py (+ opcionalmente real dev-train exportado con el filtro de
licencia de F5.2: --extra training/data/real/labels.jsonl). La validación usa un 2 % del sintético y, si existe,
real dev-val (--val-extra). Guarda config, métricas por época y el mejor checkpoint (por mAP@0.5).
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from eval.metrics import evaluate  # noqa: E402
from models.centernet_lite import CORNER_SCALE, INPUT, NUM_CLASSES, STRIDE, CenterNetLite, decode  # noqa: E402

OUT_HW = INPUT // STRIDE


def letterbox(img: np.ndarray, size: int = INPUT) -> tuple[np.ndarray, float, float, float]:
    h, w = img.shape
    s = size / max(h, w)
    nw, nh = round(w * s), round(h * s)
    out = np.full((size, size), 114, np.uint8)
    px, py = (size - nw) // 2, (size - nh) // 2
    out[py:py + nh, px:px + nw] = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)
    return out, s, px, py


def canonical(p: np.ndarray) -> np.ndarray:
    c = p.mean(0)
    p = p[np.argsort(np.arctan2(p[:, 1] - c[1], p[:, 0] - c[0]))]
    return np.roll(p, -int(np.argmin(p[:, 0] + p[:, 1])), axis=0)


class DetSet(Dataset):
    def __init__(self, root: Path, recs: list[dict], train: bool) -> None:
        self.root, self.recs, self.train = root, recs, train

    def __len__(self) -> int:
        return len(self.recs)

    def __getitem__(self, i: int):
        r = self.recs[i]
        img = cv2.imread(str(self.root / r["file"]), cv2.IMREAD_GRAYSCALE)
        objs = [(o["cls"], np.array(o["corners"], np.float32)) for o in r["objects"]]
        if self.train and random.random() < 0.5:  # flip horizontal
            w = img.shape[1]
            img = img[:, ::-1].copy()
            objs = [(c, canonical(np.stack([w - p[:, 0], p[:, 1]], 1))) for c, p in objs]
        img, s, px, py = letterbox(img)
        if self.train:
            a, b = random.uniform(0.7, 1.3), random.uniform(-25, 25)
            img = np.clip(img.astype(np.float32) * a + b, 0, 255).astype(np.uint8)
        objs = [(c, p * s + np.float32([px, py])) for c, p in objs]
        heat = np.zeros((NUM_CLASSES, OUT_HW, OUT_HW), np.float32)
        reg = np.zeros((10, OUT_HW, OUT_HW), np.float32)  # 2 offset + 8 corners
        mask = np.zeros((OUT_HW, OUT_HW), np.float32)
        yy, xx = np.mgrid[0:OUT_HW, 0:OUT_HW]
        for c, p in objs:
            ctr = p.mean(0) / STRIDE
            cx, cy = int(ctr[0]), int(ctr[1])
            if not (0 <= cx < OUT_HW and 0 <= cy < OUT_HW):
                continue
            wh = (p.max(0) - p.min(0)) / STRIDE
            sigma = max(0.8, min(wh) / 6)
            heat[c] = np.maximum(heat[c], np.exp(-((xx - ctr[0]) ** 2 + (yy - ctr[1]) ** 2) / (2 * sigma * sigma)))
            heat[c, cy, cx] = 1.0
            reg[0:2, cy, cx] = ctr - np.float32([cx, cy])
            reg[2:, cy, cx] = ((p - ctr * STRIDE) / CORNER_SCALE).reshape(-1)
            mask[cy, cx] = 1.0
        x = torch.from_numpy(img).float().div(255).unsqueeze(0)
        return x, torch.from_numpy(heat), torch.from_numpy(reg), torch.from_numpy(mask), i


def focal(pred: torch.Tensor, gt: torch.Tensor) -> torch.Tensor:
    pred = pred.clamp(1e-4, 1 - 1e-4)
    pos = gt.eq(1).float()
    neg = 1 - pos
    pos_loss = torch.log(pred) * (1 - pred) ** 2 * pos
    neg_loss = torch.log(1 - pred) * pred**2 * (1 - gt) ** 4 * neg
    n = pos.sum().clamp(min=1)
    return -(pos_loss.sum() + neg_loss.sum()) / n


def losses(out, heat, reg, mask):
    h, off, cor = out
    lh = focal(h.float(), heat)
    m = mask.unsqueeze(1)
    n = mask.sum().clamp(min=1)
    lo = (torch.abs(off.float() - reg[:, :2]) * m).sum() / n
    lc = (torch.abs(cor.float() - reg[:, 2:]) * m).sum() / n
    return lh + lo + lc, (lh.item(), lo.item(), lc.item())


def load(path: Path) -> list[dict]:
    return [json.loads(l) for l in path.read_text().splitlines() if l.strip()]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--batch", type=int, default=128)
    ap.add_argument("--lr", type=float, default=3e-3)
    ap.add_argument("--workers", type=int, default=12)
    ap.add_argument("--width", type=float, default=1.5)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()
    random.seed(a.seed)
    np.random.seed(a.seed)
    torch.manual_seed(a.seed)
    a.out.mkdir(parents=True, exist_ok=True)
    (a.out / "config.json").write_text(json.dumps({k: str(v) for k, v in vars(a).items()}, indent=2))

    recs = load(a.data / "labels.jsonl")
    if a.limit:
        recs = recs[: a.limit]
    n_val = max(200, len(recs) // 50)
    train_set, val_set = DetSet(a.data, recs[n_val:], True), DetSet(a.data, recs[:n_val], False)
    dl = DataLoader(train_set, a.batch, shuffle=True, num_workers=a.workers, pin_memory=True, drop_last=True, persistent_workers=True)
    vdl = DataLoader(val_set, 64, num_workers=4)

    dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = CenterNetLite(width=a.width).to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=1e-4)
    steps = a.epochs * len(dl)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1, (s + 1) / 500) * 0.5 * (1 + math.cos(math.pi * min(1, s / steps))))
    scaler = torch.amp.GradScaler(enabled=dev.type == "cuda")
    best = -1.0
    log = (a.out / "metrics.jsonl").open("a")
    for ep in range(a.epochs):
        model.train()
        t0, agg = time.time(), np.zeros(3)
        for x, heat, reg, mask, _ in dl:
            x, heat, reg, mask = (t.to(dev, non_blocking=True) for t in (x, heat, reg, mask))
            with torch.autocast(dev.type, dtype=torch.float16, enabled=dev.type == "cuda"):
                out = model(x)
            loss, parts = losses(out, heat, reg, mask)
            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.unscale_(opt)
            nn.utils.clip_grad_norm_(model.parameters(), 10)
            scaler.step(opt)
            scaler.update()
            sched.step()
            agg += parts
        agg /= len(dl)
        # validación
        model.eval()
        preds, gts = [], []
        with torch.no_grad():
            for x, _, _, _, idx in vdl:
                dets = decode(*model(x.to(dev)), thr=0.2)
                for d, i in zip(dets, idx.tolist()):
                    r = val_set.recs[i]
                    s = INPUT / max(r["w"], r["h"])
                    px, py = (INPUT - round(r["w"] * s)) // 2, (INPUT - round(r["h"] * s)) // 2
                    preds.append(d)
                    gts.append([(o["cls"], np.array(o["corners"], np.float32) * s + np.float32([px, py])) for o in r["objects"]])
        m = evaluate(preds, gts, NUM_CLASSES)
        row = {"epoch": ep, "loss_heat": agg[0], "loss_off": agg[1], "loss_corners": agg[2], **m, "sec": round(time.time() - t0, 1)}
        log.write(json.dumps(row) + "\n")
        log.flush()
        print(json.dumps(row), flush=True)
        torch.save(model.state_dict(), a.out / "last.pt")
        if m["mAP50"] > best:
            best = m["mAP50"]
            torch.save(model.state_dict(), a.out / "best.pt")
    print(f"mejor mAP@0.5 = {best:.4f}")


if __name__ == "__main__":
    main()
