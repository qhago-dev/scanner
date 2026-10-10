#!/usr/bin/env python3
"""Monta el vídeo: diapositivas encadenadas (xfade) + voz continua procesada + fondo musical con ducking
+ subtítulos → out/qhago-scanner-presentacion.mp4 (ffmpeg)."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
LEAD, TAIL = 0.35, 0.55  # aire antes y después de cada narración (s)
XFADE = 0.5  # fundido cruzado entre diapositivas (s)
FPS = 30


def run(*args: str) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def ts(t: float) -> str:
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int(round((s % 1) * 1000)):03d}"


def chunks(text: str, max_len: int = 84) -> list[str]:
    """Frases → bloques de subtítulo de ≤ max_len caracteres; los muy cortos se unen al vecino."""
    out: list[str] = []
    for sent in re.split(r"(?<=[.!?…])\s+", text.strip()):
        cur = ""
        for w in sent.split():
            if len(cur) + len(w) + 1 > max_len and cur:
                out.append(cur)
                cur = w
            else:
                cur = f"{cur} {w}".strip()
        if cur:
            out.append(cur)
    merged: list[str] = []
    for c in out:
        if merged and len(c) < 28 and len(merged[-1]) + len(c) + 1 <= max_len + 20:
            merged[-1] = f"{merged[-1]} {c}"
        else:
            merged.append(c)
    if len(merged) > 1 and len(merged[0]) < 28:
        first = merged.pop(0)
        merged[0] = f"{first} {merged[0]}"
    return merged


def music_bed(seconds: float, path: Path) -> None:
    """Base ambiental generada (sin licencias): acordes suaves C–Am–F–G con trémolo lento, filtrada y con eco."""
    chords = [(261.63, 329.63, 392.00), (220.00, 261.63, 329.63), (174.61, 220.00, 261.63), (196.00, 246.94, 293.66)]
    bar = 8.0
    terms = []
    for i, ch in enumerate(chords):
        # Cada acorde suena en su compás (ventana suave) y el ciclo se repite cada 32 s.
        win = f"(0.5-0.5*cos(2*PI*mod(t-{i * bar},{bar * 4})/{bar}))*lt(mod(t-{i * bar},{bar * 4}),{bar})"
        tones = "+".join(f"sin(2*PI*{f}*t)+0.35*sin(2*PI*{f * 2}*t)" for f in ch)
        terms.append(f"({tones})*{win}")
    expr = f"0.045*({'+'.join(terms)})*(0.85+0.15*sin(2*PI*0.11*t))"
    run("-f", "lavfi", "-i", f"aevalsrc='{expr}':s=48000:d={seconds:.2f}",
        "-af", "lowpass=f=1800,aecho=0.8:0.7:350|700:0.3|0.2,afade=t=in:d=2,"
               f"afade=t=out:st={max(0, seconds - 3):.2f}:d=3",
        "-ac", "2", str(path))


def main() -> None:
    guion = json.loads((HERE / "guion.json").read_text())
    dur = {int(k): v for k, v in json.loads((OUT / "durations.json").read_text()).items()}
    slots = [LEAD + dur[g["slide"]] + TAIL for g in guion]
    starts = [sum(slots[:i]) for i in range(len(slots))]
    total = sum(slots)

    # 1) Vídeo: cada clip dura su hueco + XFADE (salvo el último) y se encadena con xfade.
    inputs: list[str] = []
    for i, g in enumerate(guion):
        n = g["slide"]
        length = slots[i] + (XFADE if i < len(guion) - 1 else 0)
        if g.get("live"):
            inputs += ["-ss", "0.8", "-t", f"{length:.3f}", "-i", str(OUT / "live" / f"slide{n:02d}.webm")]
        else:
            inputs += ["-loop", "1", "-framerate", str(FPS), "-t", f"{length:.3f}", "-i",
                       str(OUT / "shots" / f"{n:02d}.png")]
    graph = []
    for i, g in enumerate(guion):
        length = slots[i] + (XFADE if i < len(guion) - 1 else 0)
        graph.append(f"[{i}:v]fps={FPS},scale=1920:1080,setsar=1,format=yuv420p,"
                     f"tpad=stop_mode=clone:stop_duration={length:.3f},trim=0:{length:.3f},setpts=PTS-STARTPTS[v{i}]")
    prev = "v0"
    for i in range(1, len(guion)):
        graph.append(f"[{prev}][v{i}]xfade=transition=fade:duration={XFADE}:offset={starts[i]:.3f}[x{i}]")
        prev = f"x{i}"
    graph.append(f"[{prev}]fade=t=in:d=0.6,fade=t=out:st={total - 0.8:.3f}:d=0.8[vout]")
    silent = OUT / "video.mp4"
    run(*inputs, "-filter_complex", ";".join(graph), "-map", "[vout]", "-t", f"{total:.3f}",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-r", str(FPS), str(silent))

    # 2) Voz continua: cada narración en su sitio, procesada (graves fuera, calidez, claridad, de-esser, compresión).
    a_in, a_graph = [], []
    for i, g in enumerate(guion):
        a_in += ["-i", str(OUT / "audio" / f"{g['slide']:02d}.wav")]
        ms = int((starts[i] + LEAD) * 1000)
        a_graph.append(f"[{i}:a]aresample=48000,adelay={ms}:all=1[a{i}]")
    a_graph.append("".join(f"[a{i}]" for i in range(len(guion)))
                   + f"amix=inputs={len(guion)}:normalize=0,apad,atrim=0:{total:.3f},"
                   "highpass=f=75,equalizer=f=200:t=q:w=1:g=2,equalizer=f=3200:t=q:w=1.2:g=1.5,"
                   "deesser=i=0.4,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=180:makeup=2,"
                   "aformat=channel_layouts=stereo[voice]")
    voice = OUT / "voice.wav"
    run(*a_in, "-filter_complex", ";".join(a_graph), "-map", "[voice]", str(voice))

    # 3) Música con ducking: baja cuando hay voz y respira en las pausas.
    music = OUT / "music.wav"
    music_bed(total, music)
    mix = OUT / "mix.wav"
    run("-i", str(voice), "-i", str(music), "-filter_complex",
        "[0:a]asplit=2[v][sc];[1:a]volume=0.55[m];"
        "[m][sc]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=600[duck];"
        "[v][duck]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[out]",
        "-map", "[out]", "-ar", "48000", str(mix))

    # 4) Subtítulos (reparto por longitud a lo largo de cada narración) y muxing final.
    srt = []
    for i, g in enumerate(guion):
        parts = chunks(g["sub"])
        tot = sum(len(p) for p in parts)
        cur = starts[i] + LEAD
        for p in parts:
            span = dur[g["slide"]] * len(p) / tot
            srt.append((cur, cur + span, p))
            cur += span
    srt_path = OUT / "qhago-scanner-presentacion.srt"
    srt_path.write_text("\n".join(f"{k}\n{ts(a)} --> {ts(b)}\n{t}\n" for k, (a, b, t) in enumerate(srt, 1)))
    style = ("FontName=DejaVu Sans,FontSize=17,PrimaryColour=&H00FFFFFF,BackColour=&H99000000,"
             "BorderStyle=4,Outline=1,Shadow=0,MarginV=28")
    final = OUT / "qhago-scanner-presentacion.mp4"
    run("-i", str(silent), "-i", str(mix), "-vf", f"subtitles={srt_path}:force_style='{style}'",
        "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", str(final))
    print(f"{final} ({total:.1f} s)")


if __name__ == "__main__":
    main()
