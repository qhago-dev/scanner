#!/usr/bin/env python3
"""Narración local con Piper (sin servicios externos): guion.json → out/audio/NN.wav + out/durations.json.

  PYTHONPATH=<piper-tts> python3 apps/demo/video/tts.py --voice <voz.onnx>
"""

from __future__ import annotations

import argparse
import json
import wave
from pathlib import Path

from piper import PiperVoice, SynthesisConfig

HERE = Path(__file__).resolve().parent


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", type=Path, required=True)
    ap.add_argument("--speed", type=float, default=1.0, help=">1 más lento (length_scale)")
    a = ap.parse_args()
    out = HERE / "out" / "audio"
    out.mkdir(parents=True, exist_ok=True)
    voice = PiperVoice.load(str(a.voice))
    cfg = SynthesisConfig(length_scale=a.speed, noise_scale=0.6, noise_w_scale=0.8)
    durations = {}
    for item in json.loads((HERE / "guion.json").read_text()):
        path = out / f"{item['slide']:02d}.wav"
        with wave.open(str(path), "wb") as w:
            voice.synthesize_wav(item["tts"], w, syn_config=cfg)
        with wave.open(str(path)) as w:
            durations[item["slide"]] = round(w.getnframes() / w.getframerate(), 3)
        print(item["slide"], durations[item["slide"]], "s")
    (HERE / "out" / "durations.json").write_text(json.dumps(durations, indent=1))
    print("total", round(sum(durations.values()), 1), "s")


if __name__ == "__main__":
    main()
