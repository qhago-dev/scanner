"""Conjunto `device`: fotos reales del modo depuración con veredicto manual (privado, no se versiona).

python3 bench/dataset/device/build.py  → bench/dataset/device/manifest.jsonl

Veredictos (apps/demo/debug-captures/<sesión>/veredictos.json):
- v1: {"_productos": {"<nombre>": "<EAN-13>"}, "<foto>": "S:<nombre>" | "M:<nombre>" | "N"}
- v2 (F10.4): {"_version": 2, "_productos": {"<nombre>": {"format": "qr_code", "text": "…"}}, "<foto>": "S:a+b"}
"S" debería leerse, "M" dudosa, "N" sin código legible; varios productos por foto con "+".

Split (F10.4) por PRODUCTO, asignado a mano en splits.json (privado): {"<texto>": "dev"|"test",
"session:<sesión>": "dev"|"test"} (la sesión solo decide el split de las negativas; por defecto dev).
Un producto sin entrada se excluye con aviso; una foto con productos de splits distintos también.
"""
import glob, hashlib, json, os, sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
CAPS = os.path.normpath(os.path.join(HERE, "../../../apps/demo/debug-captures"))
SPLITS = os.path.join(HERE, "splits.json")
SCEN = {"S": "legible", "M": "dudosa", "N": "sin-codigo"}


def products(v: dict) -> dict:
    p = v.pop("_productos", {})
    if v.pop("_version", 1) == 2:
        return {k: {"format": x["format"], "text": x["text"]} for k, x in p.items()}
    return {k: {"format": "ean_13", "text": t} for k, t in p.items()}


def object_of(c: dict) -> str:
    return f"gtin:{c['text']}" if c["format"] in ("ean_13", "upc_a", "ean_8") else f"{c['format']}:{c['text']}"


def resolution(path: str) -> list[int]:
    try:
        import cv2

        im = cv2.imread(path, cv2.IMREAD_REDUCED_GRAYSCALE_2)
        return [int(im.shape[1]) * 2, int(im.shape[0]) * 2]
    except Exception:
        return [720, 1280]


def main() -> int:
    if not os.path.exists(SPLITS):
        print(f"Falta {SPLITS}: asigna cada producto a dev/test (ver docs/guias/captura-device.md).")
        return 1
    split_of = json.load(open(SPLITS))
    out, warn = [], Counter()
    for vfile in sorted(glob.glob(f"{CAPS}/*/veredictos.json")):
        ses = os.path.basename(os.path.dirname(vfile))
        v = json.load(open(vfile))
        P = products(v)
        for k, verdict in sorted(v.items()):
            fs = glob.glob(f"{CAPS}/{ses}/{k}-*.jpg")
            if not fs:
                warn["foto inexistente"] += 1
                continue
            cls, _, prods = verdict.partition(":")
            codes = [P[p] for p in prods.split("+")] if prods else []
            if codes:
                splits = {split_of.get(c["text"]) for c in codes}
                if None in splits:
                    warn["producto sin split en splits.json"] += 1
                    continue
                if len(splits) > 1:
                    warn["foto con productos de splits distintos"] += 1
                    continue
                split = splits.pop()
                obj = "+".join(sorted(object_of(c) for c in codes))
            else:
                split = split_of.get(f"session:{ses}", "dev")
                obj = f"neg:{ses[-4:]}/{k}"
            out.append({
                "id": f"{ses[-4:]}/{k}", "file": os.path.relpath(fs[0], HERE),
                "sha256": hashlib.sha256(open(fs[0], "rb").read()).hexdigest(), "kind": "image", "codes": codes,
                "complete": True, "scenarios": [SCEN[cls]], "device": "Android 10 (Chrome 155)",
                "resolution": resolution(fs[0]), "source": "device-debug", "license": "private", "object": obj,
                "split": split,
            })
    with open(f"{HERE}/manifest.jsonl", "w") as fh:
        for s in out:
            fh.write(json.dumps(s) + "\n")
    print(len(out), dict(Counter((s["split"], s["scenarios"][0]) for s in out)))
    for w, n in warn.items():
        print(f"aviso: {n} × {w}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
