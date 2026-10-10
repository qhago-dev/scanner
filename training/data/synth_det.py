#!/usr/bin/env python3
"""Dataset sintético de detección (F5.1): imágenes con 0-4 códigos y sus 4 esquinas.

Clases: 0 = 1D, 1 = QR, 2 = DataMatrix, 3 = PDF417, 4 = Aztec.
Esquinas en orden canónico en la imagen (horario desde la de menor x+y): el warp posterior puede quedar
rotado 90/180/270°, lo que ZXing resuelve con tryRotate. Fondos procedurales; con --backgrounds se mezclan
fotos de una carpeta (SOLO licencias CC0/CC-BY, ADR-09: registrar la fuente en training/data/SOURCES.md).

Uso:
  PYTHONPATH=bench/.pydeps python3 training/data/synth_det.py --out training/data/synth/out --n 100000 --workers 16
"""

from __future__ import annotations

import argparse
import json
import random
import string
import sys
from multiprocessing import Pool
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "bench" / "dataset" / "synthetic"))
import generate as G  # noqa: E402  (reutiliza render/content del generador de benchmark)

CLASSES = ["1d", "qr", "datamatrix", "pdf417", "aztec"]
CLASS_OF = {f: 0 for f in G.LINEAR} | {"qr_code": 1, "data_matrix": 2, "pdf417": 3, "aztec": 4}
SIZES = [(640, 360), (640, 480), (480, 640), (512, 512), (720, 405)]
BACKGROUNDS: list[Path] = []


def canonical(pts: np.ndarray) -> np.ndarray:
    """Ordena 4 puntos en sentido horario empezando por el de menor x+y."""
    c = pts.mean(axis=0)
    ang = np.arctan2(pts[:, 1] - c[1], pts[:, 0] - c[0])
    p = pts[np.argsort(ang)]
    start = int(np.argmin(p[:, 0] + p[:, 1]))
    return np.roll(p, -start, axis=0)


def background(h: int, w: int, rng: random.Random) -> np.ndarray:
    if BACKGROUNDS and rng.random() < 0.6:
        img = cv2.imread(str(rng.choice(BACKGROUNDS)), cv2.IMREAD_GRAYSCALE)
        if img is not None:
            y = rng.randint(0, max(0, img.shape[0] - h))
            x = rng.randint(0, max(0, img.shape[1] - w))
            crop = img[y:y + h, x:x + w]
            if crop.shape == (h, w):
                return crop.copy()
            return cv2.resize(img, (w, h))
    img = G.background(h, w, rng)
    nr = np.random.default_rng(rng.randint(0, 2**31))
    for _ in range(rng.randint(0, 6)):  # formas y manchas
        c = int(nr.integers(30, 230))
        if rng.random() < 0.5:
            cv2.circle(img, (rng.randint(0, w), rng.randint(0, h)), rng.randint(10, 120), c, -1)
        else:
            cv2.rectangle(img, (rng.randint(0, w), rng.randint(0, h)), (rng.randint(0, w), rng.randint(0, h)), c, -1)
    return cv2.GaussianBlur(img, (0, 0), rng.uniform(0.5, 3))


def distractors(img: np.ndarray, rng: random.Random) -> None:
    """Negativos difíciles: texto, rayas tipo código, rejillas."""
    h, w = img.shape
    for _ in range(rng.randint(0, 3)):
        kind = rng.random()
        c = rng.randint(10, 90)
        if kind < 0.4:
            txt = "".join(rng.choice(string.ascii_letters + string.digits + " ") for _ in range(rng.randint(4, 16)))
            cv2.putText(img, txt, (rng.randint(0, w - 50), rng.randint(20, h)), cv2.FONT_HERSHEY_SIMPLEX, rng.uniform(0.5, 1.8), c, rng.randint(1, 3))
        elif kind < 0.7:
            x0, y0 = rng.randint(0, w - 60), rng.randint(0, h - 60)
            for i in range(rng.randint(5, 20)):
                x = x0 + i * rng.randint(3, 9)
                cv2.line(img, (x, y0), (x, y0 + rng.randint(30, 120)), c, rng.randint(1, 4))
        else:
            x0, y0, s = rng.randint(0, w - 80), rng.randint(0, h - 80), rng.randint(4, 10)
            for i in range(10):
                cv2.line(img, (x0 + i * s, y0), (x0 + i * s, y0 + 9 * s), c, 1)
                cv2.line(img, (x0, y0 + i * s), (x0 + 9 * s, y0 + i * s), c, 1)


def place(canvas: np.ndarray, sym: np.ndarray, rng: random.Random, occupied: list) -> np.ndarray | None:
    H, W = canvas.shape
    sh, sw = sym.shape
    target = rng.uniform(0.12, 0.55) * min(W, H) / max(sh, sw) * (1.6 if sh < sw / 2 else 1)
    src = np.float32([[0, 0], [sw, 0], [sw, sh], [0, sh]])
    q = src * target
    # rotación arbitraria + perspectiva
    ang = np.deg2rad(rng.uniform(0, 360) if rng.random() < 0.5 else rng.uniform(-25, 25))
    R = np.array([[np.cos(ang), -np.sin(ang)], [np.sin(ang), np.cos(ang)]], np.float32)
    q = (q - q.mean(0)) @ R.T
    jit = rng.uniform(0, 0.22) * np.abs(q).max()
    q = q + np.float32([[rng.uniform(-jit, jit), rng.uniform(-jit, jit)] for _ in range(4)])
    span = q.max(0) - q.min(0)
    if span[0] >= W - 4 or span[1] >= H - 4:
        return None
    for _ in range(20):
        off = np.float32([rng.uniform(-q[:, 0].min(), W - q[:, 0].max()), rng.uniform(-q[:, 1].min(), H - q[:, 1].max())])
        dst = q + off
        box = (*dst.min(0), *dst.max(0))
        if all(box[2] < b[0] or b[2] < box[0] or box[3] < b[1] or b[3] < box[1] for b in occupied):
            break
    else:
        return None
    M = cv2.getPerspectiveTransform(src, dst.astype(np.float32))
    warped = cv2.warpPerspective(sym, M, (W, H), flags=cv2.INTER_LINEAR, borderValue=255)
    mask = cv2.warpPerspective(np.full_like(sym, 255), M, (W, H), flags=cv2.INTER_NEAREST, borderValue=0)
    # papel con contraste/luz propios
    paper = np.clip(warped.astype(np.float32) * rng.uniform(0.75, 1.0) + rng.uniform(-10, 25), 0, 255).astype(np.uint8)
    canvas[mask > 0] = paper[mask > 0]
    occupied.append(box)
    return dst


def degrade(img: np.ndarray, rng: random.Random) -> np.ndarray:
    nr = np.random.default_rng(rng.randint(0, 2**31))
    if rng.random() < 0.3:
        k = rng.randint(3, 13) | 1
        kern = np.zeros((k, k), np.float32)
        kern[k // 2, :] = 1 / k
        rot = cv2.getRotationMatrix2D((k / 2, k / 2), rng.uniform(0, 180), 1)
        img = cv2.filter2D(img, -1, cv2.warpAffine(kern, rot, (k, k)))
    if rng.random() < 0.4:
        img = cv2.GaussianBlur(img, (0, 0), rng.uniform(0.5, 2.5))
    if rng.random() < 0.3:  # glare
        h, w = img.shape
        yy, xx = np.mgrid[0:h, 0:w]
        cx, cy, r = rng.uniform(0, w), rng.uniform(0, h), rng.uniform(0.1, 0.4) * max(w, h)
        img = np.clip(img + np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * r * r)) * rng.uniform(60, 180), 0, 255)
    if rng.random() < 0.3:  # poca luz
        img = img * rng.uniform(0.2, 0.5)
    img = np.clip(img.astype(np.float32) + nr.normal(0, rng.uniform(1, 10), img.shape), 0, 255).astype(np.uint8)
    if rng.random() < 0.15:
        img = 255 - img
    return img


def make(args: tuple[int, int, str]) -> dict | None:
    idx, seed, out = args
    rng = random.Random(seed)
    np.random.seed(seed % 2**32)
    W, H = rng.choice(SIZES)
    canvas = background(H, W, rng)
    distractors(canvas, rng)
    objects = []
    occupied: list = []
    n = rng.choices([0, 1, 2, 3, 4], weights=[0.08, 0.5, 0.22, 0.12, 0.08])[0]
    for _ in range(n * 3):
        if len(objects) >= n:
            break
        fmt = rng.choice(list(G.FORMATS))
        sym = G.render(fmt, G.content(fmt, rng, dense=rng.random() < 0.15), rng.randint(2, 4))
        if sym is None:
            continue
        if fmt in G.LINEAR and rng.random() < 0.3:  # curvatura cilíndrica (latas, botellas)
            h, w = sym.shape
            r = w * rng.uniform(0.6, 1.0)
            theta = (np.arange(w, dtype=np.float32) - w / 2) / r
            mx = np.tile((np.sin(np.clip(theta, -1.5, 1.5)) * r + w / 2).astype(np.float32), (h, 1))
            my = np.tile(np.arange(h, dtype=np.float32)[:, None], (1, w))
            sym = cv2.remap(sym, mx, my, cv2.INTER_LINEAR, borderValue=255)
        dst = place(canvas, sym, rng, occupied)
        if dst is not None:
            objects.append({"cls": CLASS_OF[fmt], "format": fmt, "corners": canonical(dst).round(1).tolist()})
    img = degrade(canvas, rng)
    name = f"{idx:07d}.jpg"
    cv2.imwrite(str(Path(out) / "images" / name), img, [cv2.IMWRITE_JPEG_QUALITY, rng.randint(40, 92)])
    return {"file": f"images/{name}", "w": W, "h": H, "objects": objects}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--n", type=int, default=100_000)
    ap.add_argument("--workers", type=int, default=16)
    ap.add_argument("--seed", type=int, default=1234)
    ap.add_argument("--backgrounds", type=Path, help="carpeta de fotos CC0/CC-BY (opcional)")
    a = ap.parse_args()
    if a.backgrounds:
        BACKGROUNDS.extend(sorted(p for p in a.backgrounds.rglob("*") if p.suffix.lower() in (".jpg", ".jpeg", ".png")))
    (a.out / "images").mkdir(parents=True, exist_ok=True)
    jobs = [(i, a.seed * 1_000_003 + i, str(a.out)) for i in range(a.n)]
    with Pool(a.workers) as pool, (a.out / "labels.jsonl").open("w") as f:
        for k, rec in enumerate(pool.imap(make, jobs, chunksize=64)):
            if rec:
                f.write(json.dumps(rec) + "\n")
            if (k + 1) % 5000 == 0:
                print(f"{k + 1}/{a.n}", flush=True)
    (a.out / "meta.json").write_text(json.dumps({"classes": CLASSES, "n": a.n, "seed": a.seed, "backgrounds": len(BACKGROUNDS)}))
    print(f"listo → {a.out}")


if __name__ == "__main__":
    main()
