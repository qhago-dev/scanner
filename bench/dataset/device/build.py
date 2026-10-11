"""Conjunto `device`: fotos reales del modo depuración con veredicto manual (privado, no se versiona).

python3 bench/dataset/device/build.py  → bench/dataset/device/manifest.jsonl
Veredictos (apps/demo/debug-captures/<sesión>/veredictos.json): "S:<producto>" debería leerse,
"M:<producto>" dudosa, "N" sin código legible. Split por sesión.
"""
import glob, hashlib, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
CAPS = os.path.normpath(os.path.join(HERE, "../../../apps/demo/debug-captures"))
SPLIT = {  # sesión → split (test: nunca usada para ajustar)
    "2026-10-10T16-33-10-d4zv": "dev",
    "2026-10-10T17-41-16-lnod": "dev",
    "2026-10-10T15-47-32-hoa6": "test",
    "2026-10-10T17-42-18-6jm4": "test",
    "2026-10-11T22-44-24-noh6": "test",  # tras fase 9 (M1-M4), sin IA
}
out = []
for ses, split in SPLIT.items():
    v = json.load(open(f"{CAPS}/{ses}/veredictos.json"))
    P = v.pop("_productos")
    for k, verdict in sorted(v.items()):
        f = glob.glob(f"{CAPS}/{ses}/{k}-*.jpg")[0]
        cls, _, prod = verdict.partition(":")
        codes = [{"format": "ean_13", "text": P[prod]}] if prod else []
        out.append({
            "id": f"{ses[-4:]}/{k}", "file": os.path.relpath(f, HERE),
            "sha256": hashlib.sha256(open(f, "rb").read()).hexdigest(), "kind": "image", "codes": codes,
            "complete": True, "scenarios": [{"S": "legible", "M": "dudosa", "N": "sin-codigo"}[cls]],
            "device": "Android 10 (Chrome 155)", "resolution": [720, 1280], "source": "device-debug",
            "license": "private", "object": f"gtin:{P[prod]}" if prod else f"neg:{ses[-4:]}/{k}", "split": split,
        })
with open(f"{HERE}/manifest.jsonl", "w") as fh:
    for s in out:
        fh.write(json.dumps(s) + "\n")
from collections import Counter
print(len(out), Counter((s["split"], s["scenarios"][0]) for s in out))
