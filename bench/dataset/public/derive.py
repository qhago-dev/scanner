#!/usr/bin/env python3
"""Conjuntos derivados de `public` (F10.3): negativas (recortes sin código) y desenfoque calibrado en módulos.

PYTHONPATH=bench/.pydeps python3 bench/dataset/public/derive.py [neg|blur|all] [--check-l] [--limit N]

- Localización con zxing-cpp Python 3.1.1 (independiente del motor de qhago), opciones por defecto.
  Sin localización, la imagen no genera derivados (sesgo declarado en SOURCES.md).
- neg  → manifest-neg.jsonl  (dataset `public-neg`): recortes que no tocan la zona del código (1,5·L × 1,2·L),
         como mucho 2 por imagen (los de mayor varianza), verificados con zxing-cpp y revisados a mano
         (neg-exclude.txt: recortes con barras visibles). Solo control de regresión.
- blur → manifest-blur.jsonl (dataset `public-blur`): de cada imagen `normal`, gaussiana σ ∈ {0,6; 0,9; 1,2}
         módulos, disco y movimiento con la misma varianza que σ 0,9; ruido σ 2 y JPEG 85. σ nominal.
Derivados en derived/ (gitignored). Split, objeto y licencia del original.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from multiprocessing import Pool
from pathlib import Path

import cv2
import numpy as np
import zxingcpp

HERE = Path(__file__).resolve().parent
OUT = HERE / "derived"
MODULES = {"ean_13": 95, "ean_8": 67}
SIGMAS = (0.6, 0.9, 1.2)
EQ_SIGMA = 0.9  # σ equivalente de las variantes disco y movimiento


def seed_of(s: str) -> int:
    return int(hashlib.sha1(s.encode()).hexdigest()[:8], 16)


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def locate(gray: np.ndarray, want: str) -> dict | None:
    """Cuadrilátero del código esperado según zxing-cpp; L = largo medio (a través de las barras)."""
    for r in zxingcpp.read_barcodes(gray):
        if r.text.lstrip("0") != want.lstrip("0"):
            continue
        p = r.position
        pts = np.array(
            [[p.top_left.x, p.top_left.y], [p.top_right.x, p.top_right.y],
             [p.bottom_right.x, p.bottom_right.y], [p.bottom_left.x, p.bottom_left.y]],
            dtype=np.float64,
        )
        top = pts[1] - pts[0]
        bot = pts[2] - pts[3]
        length = (np.linalg.norm(top) + np.linalg.norm(bot)) / 2
        if length < 1:
            return None
        u = (top + bot) / (np.linalg.norm(top + bot) or 1)
        return {"pts": pts, "c": pts.mean(axis=0), "u": u, "L": float(length)}
    return None


def exclusion_mask(shape: tuple[int, int], loc: dict) -> np.ndarray:
    """Rectángulo orientado de 1,5·L (a lo largo) × 1,2·L (a lo alto de las barras), centrado en el símbolo."""
    c, u, length = loc["c"], loc["u"], loc["L"]
    v = np.array([-u[1], u[0]])
    a, b = 0.75 * length, 0.6 * length
    poly = np.array([c - a * u - b * v, c + a * u - b * v, c + a * u + b * v, c - a * u + b * v])
    m = np.zeros(shape, np.uint8)
    cv2.fillPoly(m, [np.round(poly).astype(np.int32)], 1)
    return m


def negatives(img: np.ndarray, gray: np.ndarray, loc: dict) -> list[tuple[np.ndarray, tuple[int, int, int]]]:
    h, w = gray.shape
    side = int(max(160, 0.4 * min(h, w)))
    if side > min(h, w):
        return []
    excl = exclusion_mask(gray.shape, loc)
    step = max(1, side // 2)
    cands = []
    for y in range(0, h - side + 1, step):
        for x in range(0, w - side + 1, step):
            if excl[y : y + side, x : x + side].any():
                continue
            cands.append((float(gray[y : y + side, x : x + side].std()), x, y))
    cands.sort(reverse=True)
    out: list[tuple[np.ndarray, tuple[int, int, int]]] = []
    for _, x, y in cands:
        if len(out) == 2:
            break
        # sin solaparse más de la mitad con un recorte ya elegido
        if any(abs(x - ox) < side / 2 and abs(y - oy) < side / 2 for _, (ox, oy, _) in out):
            continue
        crop = img[y : y + side, x : x + side]
        if zxingcpp.read_barcodes(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)):
            continue  # algo legible: no es una negativa
        out.append((crop, (x, y, side)))
    return out


def disk_kernel(r: float) -> np.ndarray:
    n = int(math.ceil(r))
    yy, xx = np.mgrid[-n : n + 1, -n : n + 1]
    k = (xx * xx + yy * yy <= r * r).astype(np.float64)
    return k / k.sum()


def motion_kernel(length: float, angle: float) -> np.ndarray:
    n = int(math.ceil(length / 2)) + 1
    k = np.zeros((2 * n + 1, 2 * n + 1), np.float64)
    dx, dy = math.cos(angle), math.sin(angle)
    for t in np.linspace(-length / 2, length / 2, max(2, int(length * 4))):
        k[int(round(n + t * dy)), int(round(n + t * dx))] += 1
    return k / k.sum()


def blur_variants(img: np.ndarray, wmod: float, sid: str) -> list[tuple[str, float, np.ndarray]]:
    rng = np.random.default_rng(seed_of(sid))
    out: list[tuple[str, float, np.ndarray]] = []
    for s in SIGMAS:
        out.append(("gauss", s, cv2.GaussianBlur(img, (0, 0), s * wmod)))
    # disco de radio r: varianza marginal r²/4 = σ² → r = 2σ·w
    out.append(("disk", EQ_SIGMA, cv2.filter2D(img, -1, disk_kernel(2 * EQ_SIGMA * wmod))))
    # movimiento lineal de longitud l: varianza l²/12 = σ² → l = √12·σ·w (dirección aleatoria)
    ang = float(rng.uniform(0, math.pi))
    out.append(("motion", EQ_SIGMA, cv2.filter2D(img, -1, motion_kernel(math.sqrt(12) * EQ_SIGMA * wmod, ang))))
    noisy = []
    for kind, s, im in out:
        n = rng.normal(0, 2, im.shape)
        noisy.append((kind, s, np.clip(im.astype(np.float64) + n, 0, 255).astype(np.uint8)))
    return noisy


def bars_extent_ratio(gray: np.ndarray, loc: dict) -> float | None:
    """Extensión de las barras (primera a última transición oscura) / L, sobre la línea central (para --check-l)."""
    c, u, length = loc["c"], loc["u"], loc["L"]
    ts = np.linspace(-1.0 * length, 1.0 * length, int(4 * length))
    xs = np.clip(np.round(c[0] + ts * u[0]).astype(int), 0, gray.shape[1] - 1)
    ys = np.clip(np.round(c[1] + ts * u[1]).astype(int), 0, gray.shape[0] - 1)
    prof = gray[ys, xs].astype(np.float64)
    thr = (np.percentile(prof, 5) + np.percentile(prof, 95)) / 2
    dark = np.where(prof < thr)[0]
    if len(dark) < 2:
        return None
    # recorta barras aisladas lejos del símbolo: se queda con el grupo más largo de oscuros con huecos < L/20
    gap = length / 20 * 2  # en muestras (4 muestras por px → L/20 px ≈ 2·L/40)
    groups, start, prev = [], dark[0], dark[0]
    for d in dark[1:]:
        if d - prev > gap * 2:
            groups.append((start, prev))
            start = d
        prev = d
    groups.append((start, prev))
    a, b = max(groups, key=lambda g: g[1] - g[0])
    return (ts[b] - ts[a]) / length


def process(args: tuple[dict, list[str]]) -> dict:
    e, modes = args
    src = HERE / e["file"]
    img = cv2.imread(str(src), cv2.IMREAD_COLOR)
    res: dict = {"id": e["id"], "located": False, "neg": [], "blur": [], "ratio": None}
    if img is None:
        return res
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    code = e["codes"][0]
    loc = locate(gray, code["text"])
    if not loc:
        return res
    res["located"] = True
    res["ratio"] = bars_extent_ratio(gray, loc)
    safe = e["id"].replace("/", "__")
    base = {k: e[k] for k in ("device", "source", "license", "object", "split") if k in e}
    if "neg" in modes:
        for k, (crop, (x, y, side)) in enumerate(negatives(img, gray, loc)):
            p = OUT / "neg" / f"{safe}__{k}.png"
            cv2.imwrite(str(p), crop)
            res["neg"].append({
                "id": f"{e['id']}#neg{k}", "file": str(p.relative_to(HERE)), "sha256": sha256(p),
                "kind": "image", "codes": [], "complete": True, "scenarios": ["negativa-recorte"],
                "resolution": [side, side], **base, "source": f"{e['source']}-neg",
                "derivedFrom": {"id": e["id"], "crop": [x, y, side, side]},
            })
    if "blur" in modes and e["scenarios"] == ["normal"]:
        wmod = loc["L"] / MODULES.get(code["format"], 95)
        if wmod >= 1.5:
            for kind, s, im in blur_variants(img, wmod, e["id"]):
                tag = f"{'blur' if kind == 'gauss' else kind}-{s}"
                p = OUT / "blur" / f"{safe}__{tag}.jpg"
                cv2.imwrite(str(p), im, [cv2.IMWRITE_JPEG_QUALITY, 85])
                res["blur"].append({
                    "id": f"{e['id']}#{tag}", "file": str(p.relative_to(HERE)), "sha256": sha256(p),
                    "kind": "image", "codes": e["codes"], "complete": False, "scenarios": [tag],
                    "resolution": e.get("resolution"), **base, "source": f"{e['source']}-blur",
                    "derivedFrom": {"id": e["id"], "blur": kind, "sigmaModules": s,
                                    "modulePx": round(wmod, 3)},
                })
    return res


def main() -> None:
    args = sys.argv[1:]
    mode = next((a for a in args if a in ("neg", "blur", "all")), "all")
    modes = ["neg", "blur"] if mode == "all" else [mode]
    limit = int(args[args.index("--limit") + 1]) if "--limit" in args else None
    entries = [json.loads(l) for l in (HERE / "manifest.jsonl").read_text().splitlines() if l.strip()]
    if limit:
        entries = entries[:: max(1, len(entries) // limit)][:limit]
    for m in modes:
        (OUT / m).mkdir(parents=True, exist_ok=True)
    with Pool() as pool:
        results = pool.map(process, [(e, modes) for e in entries], chunksize=4)
    located = sum(r["located"] for r in results)
    print(f"{len(entries)} imágenes, {located} localizadas por zxing-cpp ({located / max(1, len(entries)):.0%})")
    if "--check-l" in args:
        rs = [r["ratio"] for r in results if r["ratio"] is not None]
        rs.sort()
        print(f"extensión de barras / L: mediana {rs[len(rs) // 2]:.3f}, p10 {rs[len(rs) // 10]:.3f}, "
              f"p90 {rs[9 * len(rs) // 10]:.3f} (n={len(rs)})")
    excluded = {
        l.strip() for l in (HERE / "neg-exclude.txt").read_text().splitlines() if l.strip() and not l.startswith("#")
    } if (HERE / "neg-exclude.txt").exists() else set()
    for m, name in (("neg", "manifest-neg.jsonl"), ("blur", "manifest-blur.jsonl")):
        if m not in modes:
            continue
        rows = [x for r in results for x in r[m] if x["id"] not in excluded]
        (HERE / name).write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in rows))
        print(f"{name}: {len(rows)} muestras")
        for split in ("dev", "test", "holdout"):
            sub = [x for x in rows if x["split"] == split]
            if m == "neg":
                print(f"  {split:8s} {len(sub)} negativas de {len({x['derivedFrom']['id'] for x in sub})} imágenes")
            else:
                for fmt in MODULES:
                    objs = {x["object"] for x in sub if x["codes"][0]["format"] == fmt}
                    print(f"  {split:8s} {fmt}: {len(sub and [x for x in sub if x['codes'][0]['format'] == fmt])}"
                          f" muestras, {len(objs)} objetos")


if __name__ == "__main__":
    main()
