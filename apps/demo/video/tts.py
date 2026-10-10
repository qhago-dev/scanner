#!/usr/bin/env python3
"""Narración local (sin servicios externos): guion.json → out/audio/NN.wav + out/durations.json.

Motores:
  kokoro (por defecto, más natural): Kokoro-82M (Apache-2.0), voz ef_dora, fonemas es-419 (español latino).
      PYTHONPATH=<kokoro> python3 apps/demo/video/tts.py --voice ef_dora
  piper: PYTHONPATH=<piper-tts> python3 apps/demo/video/tts.py --engine piper --voice <voz.onnx>
"""

from __future__ import annotations

import argparse
import json
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent


def write_wav(path: Path, audio: np.ndarray, rate: int) -> None:
    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())


def kokoro_engine(voice: str, speed: float):
    from kokoro import KPipeline
    from misaki import espeak

    pipe = KPipeline(lang_code="e", repo_id="hexgrad/Kokoro-82M")
    pipe.g2p = espeak.EspeakG2P(language="es-419")  # seseo latinoamericano (es = castellano con θ)

    def synth(text: str) -> tuple[np.ndarray, int]:
        parts = []
        for _, _, audio in pipe(text, voice=voice, speed=speed, split_pattern=r"(?<=[.!?…])\s+"):
            a = audio.numpy() if hasattr(audio, "numpy") else np.asarray(audio)
            parts += [a, np.zeros(int(24000 * 0.18), np.float32)]  # respiro natural entre frases
        return np.concatenate(parts[:-1]), 24000

    return synth


def piper_engine(voice: str, speed: float):
    from piper import PiperVoice, SynthesisConfig

    v = PiperVoice.load(voice)
    cfg = SynthesisConfig(length_scale=1 / speed, noise_scale=0.6, noise_w_scale=0.8)

    def synth(text: str) -> tuple[np.ndarray, int]:
        chunks = list(v.synthesize(text, syn_config=cfg))
        audio = np.concatenate([c.audio_float_array for c in chunks])
        return audio, chunks[0].sample_rate

    return synth


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", choices=["kokoro", "piper"], default="kokoro")
    ap.add_argument("--voice", default="ef_dora")
    ap.add_argument("--speed", type=float, default=1.0, help="<1 más lento")
    a = ap.parse_args()
    out = HERE / "out" / "audio"
    out.mkdir(parents=True, exist_ok=True)
    synth = (kokoro_engine if a.engine == "kokoro" else piper_engine)(a.voice, a.speed)
    durations = {}
    for item in json.loads((HERE / "guion.json").read_text()):
        audio, rate = synth(item["tts"])
        write_wav(out / f"{item['slide']:02d}.wav", audio, rate)
        durations[item["slide"]] = round(len(audio) / rate, 3)
        print(item["slide"], durations[item["slide"]], "s", flush=True)
    (HERE / "out" / "durations.json").write_text(json.dumps(durations, indent=1))
    print("total", round(sum(durations.values()), 1), "s")


if __name__ == "__main__":
    main()
