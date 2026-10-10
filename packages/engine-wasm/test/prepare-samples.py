#!/usr/bin/env python3
"""Copia zxing-cpp/test/samples a build/samples convirtiendo WebP → PNG (stb_image no lee WebP).
Conserva los .txt de resultado esperado. Uso: python3 -I test/prepare-samples.py <samples> <destino>"""
import shutil
import sys
from pathlib import Path

from PIL import Image

src, dst = Path(sys.argv[1]), Path(sys.argv[2])
n = 0
for f in sorted(src.rglob("*")):
    if not f.is_file():
        continue
    out = dst / f.relative_to(src)
    out.parent.mkdir(parents=True, exist_ok=True)
    if f.suffix.lower() == ".webp":
        out = out.with_suffix(".png")
        if not out.exists():
            Image.open(f).save(out)
        n += 1
    elif f.suffix.lower() in (".png", ".jpg", ".jpeg", ".txt"):
        if not out.exists():
            shutil.copy2(f, out)
print(f"samples en {dst} ({n} WebP convertidos)")
