#!/usr/bin/env python3
"""Dataset sintético de benchmark (F1.4) con símbolos REALES de los 13 formatos.

Renderiza con el writer de zxing-cpp (Apache-2.0), aplica el escenario y escribe un manifest
compatible con bench/dataset/manifest.schema.json (`source: "synthetic"`). La etiqueta de cada
muestra se verifica leyendo el render limpio con ZXing: si no se lee, la muestra se descarta.

Uso:
  PYTHONPATH=bench/.pydeps python3 bench/dataset/synthetic/generate.py --out bench/dataset/synthetic/out \
      --per-scenario 100 --seed 7
Requisitos: zxing-cpp (pip --target bench/.pydeps), numpy, opencv-python, pillow.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import string
from pathlib import Path

import cv2
import numpy as np
import zxingcpp

F = zxingcpp.BarcodeFormat
FORMATS = {
    "aztec": F.Aztec, "codabar": F.Codabar, "code_39": F.Code39, "code_93": F.Code93, "code_128": F.Code128,
    "data_matrix": F.DataMatrix, "ean_8": F.EAN8, "ean_13": F.EAN13, "itf": F.ITF, "pdf417": F.PDF417,
    "qr_code": F.QRCode, "upc_a": F.UPCA, "upc_e": F.UPCE,
}
LINEAR = {"codabar", "code_39", "code_93", "code_128", "ean_8", "ean_13", "itf", "upc_a", "upc_e"}
SCENARIOS = ["normal", "low_light", "motion_blur", "defocus", "perspective", "curved", "small", "multi",
             "glare", "screen", "damaged", "inverted", "dense_2d"]


def gtin_check(digits: str) -> str:
    s = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(digits)))
    return str((10 - s % 10) % 10)


def upce_to_upca(upce7: str) -> str:
    """UPC-E (sistema + 6 dígitos) → UPC-A de 11 dígitos (sin check)."""
    ns, d = upce7[0], upce7[1:]
    last = d[5]
    if last in "012":
        body = d[0:2] + last + "0000" + d[2:5]
    elif last == "3":
        body = d[0:3] + "00000" + d[3:5]
    elif last == "4":
        body = d[0:4] + "00000" + d[4]
    else:
        body = d[0:5] + "0000" + last
    return ns + body


def content(fmt: str, rng: random.Random, dense: bool = False) -> str:
    digits = lambda n: "".join(rng.choice(string.digits) for _ in range(n))  # noqa: E731
    alnum = string.ascii_uppercase + string.digits
    if fmt == "ean_13":
        b = digits(12)
        return b + gtin_check(b)
    if fmt == "ean_8":
        b = digits(7)
        return b + gtin_check(b)
    if fmt == "upc_a":
        b = digits(11)
        return b + gtin_check(b)
    if fmt == "upc_e":
        e = "0" + digits(5) + rng.choice("56789")
        return e + gtin_check(upce_to_upca(e))
    if fmt == "itf":
        return digits(rng.choice([10, 14]))
    if fmt == "codabar":
        return rng.choice("ABCD") + digits(rng.randint(6, 12)) + rng.choice("ABCD")
    if fmt in ("code_39", "code_93"):
        return "".join(rng.choice(alnum + "-. ") for _ in range(rng.randint(5, 12))).strip() or "QHAGO"
    if fmt == "code_128":
        return "".join(rng.choice(alnum + "-/abcdefgh") for _ in range(rng.randint(6, 16)))
    n = rng.randint(300, 900) if dense else rng.randint(12, 80)
    pool = string.ascii_letters + string.digits + " -_/:.?=&"
    text = "".join(rng.choice(pool) for _ in range(n))
    return ("https://qhago.dev/" + text) if (not dense and rng.random() < 0.4) else text


def render(fmt: str, text: str, scale: int) -> np.ndarray | None:
    try:
        bc = zxingcpp.create_barcode(text, FORMATS[fmt])
        img = np.array(bc.to_image(scale=scale, add_quiet_zones=True), dtype=np.uint8)
    except Exception:
        return None
    if fmt in LINEAR and img.shape[0] < 60 * scale // 2:  # barras más altas para 1D
        img = cv2.resize(img, (img.shape[1], max(img.shape[0], 40 * scale)), interpolation=cv2.INTER_NEAREST)
    return img


def verify(img: np.ndarray, fmt: str) -> str | None:
    found = zxingcpp.read_barcodes(img, formats=FORMATS[fmt])
    return found[0].text if found else None


def background(h: int, w: int, rng: random.Random) -> np.ndarray:
    base = rng.randint(150, 235)
    gx = np.linspace(-rng.randint(0, 40), rng.randint(0, 40), w)[None, :]
    gy = np.linspace(-rng.randint(0, 40), rng.randint(0, 40), h)[:, None]
    noise = np.random.default_rng(rng.randint(0, 2**31)).normal(0, rng.uniform(2, 10), (h, w))
    return np.clip(base + gx + gy + noise, 0, 255).astype(np.uint8)


def paste(canvas: np.ndarray, sym: np.ndarray, x: int, y: int) -> list[list[float]]:
    h, w = sym.shape
    canvas[y:y + h, x:x + w] = np.minimum(canvas[y:y + h, x:x + w], sym)
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]


def warp_points(pts, m):
    p = cv2.perspectiveTransform(np.array([pts], dtype=np.float32), m)[0]
    return [[round(float(a), 1), round(float(b), 1)] for a, b in p]


def apply(scn: str, img: np.ndarray, corners: list, rng: random.Random):
    h, w = img.shape
    if scn == "low_light":
        img = np.clip(img.astype(np.float32) * rng.uniform(0.15, 0.35)
                      + np.random.default_rng(rng.randint(0, 2**31)).normal(0, 6, img.shape), 0, 255).astype(np.uint8)
    elif scn == "motion_blur":
        k = rng.randint(7, 17)
        kern = np.zeros((k, k), np.float32)
        kern[k // 2, :] = 1 / k
        rot = cv2.getRotationMatrix2D((k / 2, k / 2), rng.uniform(0, 180), 1)
        img = cv2.filter2D(img, -1, cv2.warpAffine(kern, rot, (k, k)))
    elif scn == "defocus":
        img = cv2.GaussianBlur(img, (0, 0), rng.uniform(1.8, 3.2))
    elif scn == "perspective":
        d = 0.28
        src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
        dst = np.float32([[rng.uniform(0, d) * w, rng.uniform(0, d) * h], [w - rng.uniform(0, d) * w, rng.uniform(0, d) * h],
                          [w - rng.uniform(0, d) * w, h - rng.uniform(0, d) * h], [rng.uniform(0, d) * w, h - rng.uniform(0, d) * h]])
        m = cv2.getPerspectiveTransform(src, dst)
        img = cv2.warpPerspective(img, m, (w, h), borderValue=200)
        corners = [warp_points(c, m) for c in corners]
    elif scn == "curved":
        # Cilindro centrado en el código (no en el canvas) y con radio relativo a su ancho.
        (x0, _), _, (x1, _), _ = corners[0]
        cx, cw = (x0 + x1) / 2, max(x1 - x0, 1)
        xs = np.arange(w, dtype=np.float32)
        r = cw * rng.uniform(0.55, 0.9)
        theta = (xs - cx) / r
        src_x = (np.sin(np.clip(theta, -1.5, 1.5)) * r + cx).astype(np.float32)
        map_x = np.tile(src_x, (h, 1))
        map_y = np.tile(np.arange(h, dtype=np.float32)[:, None], (1, w))
        shade = (0.75 + 0.25 * np.cos(theta))[None, :]
        img = np.clip(cv2.remap(img, map_x, map_y, cv2.INTER_LINEAR, borderValue=200) * shade, 0, 255).astype(np.uint8)
    elif scn == "glare":
        yy, xx = np.mgrid[0:h, 0:w]
        cx, cy, rad = rng.uniform(0.2, 0.8) * w, rng.uniform(0.2, 0.8) * h, rng.uniform(0.15, 0.35) * max(w, h)
        g = np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * rad ** 2))) * rng.uniform(120, 200)
        img = np.clip(img.astype(np.float32) + g, 0, 255).astype(np.uint8)
    elif scn == "screen":
        yy, xx = np.mgrid[0:h, 0:w]
        moire = 12 * np.sin(xx * rng.uniform(0.6, 1.4)) * np.sin(yy * rng.uniform(0.6, 1.4))
        lines = (yy % rng.randint(3, 5) == 0) * -18
        img = np.clip(img.astype(np.float32) * 0.8 + 30 + moire + lines, 0, 255).astype(np.uint8)
    elif scn == "damaged":
        for _ in range(rng.randint(1, 3)):
            c = rng.choice(corners)
            x0, y0 = c[0]
            x1, y1 = c[2]
            bw, bh = (x1 - x0) * rng.uniform(0.06, 0.15), (y1 - y0) * rng.uniform(0.15, 0.5)
            px, py = rng.uniform(x0, x1 - bw), rng.uniform(y0, y1 - bh)
            img[int(py):int(py + bh), int(px):int(px + bw)] = rng.choice([30, 225])
    elif scn == "inverted":
        img = 255 - img
    return img, corners


def make_sample(scn: str, idx: int, rng: random.Random):
    fmts = list(FORMATS)
    if scn == "dense_2d":
        fmts = ["qr_code", "data_matrix", "pdf417", "aztec"]
    n_codes = rng.randint(2, 4) if scn == "multi" else 1
    W, H = rng.choice([(1280, 720), (960, 720), (1024, 768)])
    canvas = background(H, W, rng)
    codes, boxes = [], []
    tries = 0
    while len(codes) < n_codes and tries < 20:
        tries += 1
        fmt = rng.choice(fmts)
        text = content(fmt, rng, dense=scn == "dense_2d")
        scale = 1 if scn == "small" else rng.randint(2, 4)
        sym = render(fmt, text, scale)
        if sym is None:
            continue
        expected = verify(sym, fmt)
        if expected is None:
            continue
        if scn != "small":  # tamaño aleatorio realista
            f = rng.uniform(0.25, 0.55) * W / max(sym.shape[1], 1)
            if n_codes > 1:
                f *= 0.6
            sym = cv2.resize(sym, None, fx=f, fy=f, interpolation=cv2.INTER_AREA if f < 1 else cv2.INTER_LINEAR)
        h, w = sym.shape
        if w >= W - 10 or h >= H - 10:
            continue
        for _ in range(30):
            x, y = rng.randint(5, W - w - 5), rng.randint(5, H - h - 5)
            if all(x + w < bx or bx + bw < x or y + h < by or by + bh < y for bx, by, bw, bh in boxes):
                break
        else:
            continue
        boxes.append((x, y, w, h))
        codes.append({"format": fmt, "text": expected, "corners": paste(canvas, sym, x, y)})
    if not codes:
        return None
    corners = [c["corners"] for c in codes]
    img, corners = apply(scn, canvas, corners, rng)
    for c, k in zip(codes, corners):
        c["corners"] = k
    if scn == "multi" and rng.random() < 0.5:  # multi también con un efecto suave
        img = cv2.GaussianBlur(img, (0, 0), 0.8)
    return img, codes


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--per-scenario", type=int, default=100)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    rng = random.Random(a.seed)
    (a.out / "images").mkdir(parents=True, exist_ok=True)
    lines = []
    for scn in SCENARIOS:
        made = 0
        while made < a.per_scenario:
            s = make_sample(scn, made, rng)
            if s is None:
                continue
            img, codes = s
            sid = f"syn-{scn}-{made:04d}"
            rel = f"images/{sid}.jpg"
            ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, rng.randint(55, 95)])
            assert ok
            (a.out / rel).write_bytes(buf.tobytes())
            lines.append({
                "id": sid, "file": rel, "sha256": hashlib.sha256(buf.tobytes()).hexdigest(), "kind": "image",
                "codes": codes, "complete": True, "scenarios": [scn], "device": "synthetic",
                "resolution": [img.shape[1], img.shape[0]], "source": "synthetic", "license": "own",
                "object": sid,  # cada muestra sintética es su propio "objeto" para el bootstrap
                "split": "test" if rng.random() < 0.3 else "dev",
            })
            made += 1
        print(f"{scn}: {made}")
    # Negativas: fondos con texturas de barras/rejas sin códigos.
    for i in range(max(10, a.per_scenario // 2)):
        W, H = 1280, 720
        img = background(H, W, rng)
        for _ in range(rng.randint(5, 20)):
            x = rng.randint(0, W - 40)
            cv2.rectangle(img, (x, rng.randint(0, H // 2)), (x + rng.randint(2, 12), rng.randint(H // 2, H)), rng.randint(20, 90), -1)
        cv2.putText(img, "QHAGO 1234 ABCD", (rng.randint(0, 400), rng.randint(100, 600)), cv2.FONT_HERSHEY_SIMPLEX, 2, 40, 3)
        sid = f"syn-negative-{i:04d}"
        rel = f"images/{sid}.jpg"
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        (a.out / rel).write_bytes(buf.tobytes())
        lines.append({"id": sid, "file": rel, "sha256": hashlib.sha256(buf.tobytes()).hexdigest(), "kind": "image",
                      "codes": [], "complete": True, "scenarios": ["negative"], "device": "synthetic",
                      "resolution": [W, H], "source": "synthetic", "license": "own", "object": sid,
                      "split": "test" if rng.random() < 0.3 else "dev"})
    (a.out / "manifest.jsonl").write_text("".join(json.dumps(l, ensure_ascii=False) + "\n" for l in lines))
    print(f"{len(lines)} muestras → {a.out / 'manifest.jsonl'}")


if __name__ == "__main__":
    main()
