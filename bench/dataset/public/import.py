#!/usr/bin/env python3
"""Construye manifest.jsonl (esquema ../manifest.schema.json) a partir de raw/ (ver fetch.sh).

- ArTe-Lab Medium 1D (CC BY 3.0): Dataset1 = autofoco ("normal"), Dataset2 = sin autofoco ("defocus"); valor en .txt.
- KAIST / Zenodo 13586402 (CC BY 4.0): real/ (EAN-13, valor en txt/) y e8_bb (EAN-8, valor en el nombre).
  real/ incluye copias de ArTe-Lab (se descartan: se usan los originales) y de Muenster BarcodeDB
  (nombre "<EAN>-NN-N"; licencia original CC BY-NC-ND 4.0 → marcadas research-only, solo evaluación, ADR-09).
Split por objeto (= valor del código, el mismo producto nunca cae en dos splits), F10.1: b = sha1(valor) % 10;
b < 5 → dev, 5 ≤ b < 8 → test, b ≥ 8 → holdout. test y holdout salen del test anterior a F10 (ya observado a nivel de
muestra): son semi-ciegos, sirven de control de regresión (ver SOURCES.md).
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

import cv2

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def gtin_ok(v: str) -> bool:
    d = [int(c) for c in v]
    s = sum(x * (3 if i % 2 == 0 else 1) for i, x in enumerate(reversed(d[:-1])))
    return (10 - s % 10) % 10 == d[-1]


def split_of(value: str) -> str:
    b = int(hashlib.sha1(value.encode()).hexdigest(), 16) % 10
    return "dev" if b < 5 else "test" if b < 8 else "holdout"


def entry(img: Path, value: str, fmt: str, scenario: str, source: str, license_: str, device: str) -> dict | None:
    if not (value.isdigit() and gtin_ok(value)):
        return None  # etiqueta dudosa: mejor fuera que ruido en el ground truth
    im = cv2.imread(str(img), cv2.IMREAD_UNCHANGED)
    if im is None:
        return None
    split = split_of(value)
    return {
        "id": f"{source}/{img.stem}",
        "file": str(img.relative_to(HERE)),
        "sha256": sha256(img),
        "kind": "image",
        "codes": [{"format": fmt, "text": value}],
        "complete": False,  # solo se etiquetó el código principal
        "scenarios": [scenario],
        "device": device,
        "resolution": [int(im.shape[1]), int(im.shape[0])],
        "source": source,
        "license": license_,
        "object": f"gtin:{value}",
        "split": split,
    }


def main() -> None:
    out: list[dict] = []
    skipped = 0
    med = RAW / "artelab_medium" / "BarcodeDatasets"
    for ds, scen in (("Dataset1", "normal"), ("Dataset2", "defocus")):
        for img in sorted((med / ds).glob("*")):
            if img.suffix.lower() not in (".jpg", ".jpeg", ".png"):
                continue
            txt = img.with_name(img.name + ".txt")
            if not txt.exists():
                skipped += 1
                continue
            e = entry(img, txt.read_text().strip(), "ean_13", scen, f"artelab-{ds.lower()}", "CC-BY-3.0", "Nokia (ArTe-Lab)")
            if e:
                out.append(e)
            else:
                skipped += 1
    real = RAW / "kaist_real" / "real"
    for img in sorted((real / "img").glob("*.jpg")):
        n = img.stem
        if re.match(r"^(0[56]102009|PI|Pf|IMAG)", n):
            continue  # copia de ArTe-Lab
        txt = real / "txt" / f"{n}.txt"
        if not txt.exists():
            skipped += 1
            continue
        muenster = bool(re.match(r"^\d{13}-\d\d-\d$", n))
        e = entry(
            img, txt.read_text().strip(), "ean_13", "normal",
            "muenster" if muenster else "kaist",
            "research-only" if muenster else "CC-BY-4.0",
            "Nokia N95 (Muenster)" if muenster else "varios (KAIST)",
        )
        if e:
            out.append(e)
        else:
            skipped += 1
    for img in sorted((RAW / "kaist_e8" / "e8_bb" / "e8").glob("*.jpg")):
        e = entry(img, img.stem[:8], "ean_8", "normal", "kaist-e8", "CC-BY-4.0", "varios (KAIST)")
        if e:
            out.append(e)
        else:
            skipped += 1
    (HERE / "manifest.jsonl").write_text("".join(json.dumps(e, ensure_ascii=False) + "\n" for e in out))
    by = {}
    for e in out:
        by.setdefault((e["source"], e["split"]), 0)
        by[(e["source"], e["split"])] += 1
    print(f"{len(out)} muestras ({skipped} descartadas)")
    for k in sorted(by):
        print(f"  {k[0]:20s} {k[1]:4s} {by[k]}")


if __name__ == "__main__":
    sys.exit(main())
