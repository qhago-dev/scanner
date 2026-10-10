#!/usr/bin/env python3
"""Monta el vídeo: diapositivas + narración + subtítulos → out/qhago-scanner-presentacion.mp4 (ffmpeg)."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
LEAD, TAIL = 0.45, 0.65  # silencio antes y después de cada narración (s)
FPS = 30


def run(*args: str) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def ts(t: float) -> str:
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int(round((s % 1) * 1000)):03d}"


def chunks(text: str, max_len: int = 84) -> list[str]:
    """Frases → bloques de subtítulo de ≤ max_len caracteres (2 líneas cortas)."""
    out: list[str] = []
    for sent in re.split(r"(?<=[.!?])\s+", text.strip()):
        cur = ""
        for w in sent.split():
            if len(cur) + len(w) + 1 > max_len and cur:
                out.append(cur)
                cur = w
            else:
                cur = f"{cur} {w}".strip()
        if cur:
            out.append(cur)
    # Fragmentos muy cortos se unen al anterior si caben (evita destellos de 1-2 palabras).
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


def main() -> None:
    guion = json.loads((HERE / "guion.json").read_text())
    dur = {int(k): v for k, v in json.loads((OUT / "durations.json").read_text()).items()}
    seg_dir = OUT / "segments"
    seg_dir.mkdir(exist_ok=True)
    srt, t0, segs = [], 0.0, []
    for g in guion:
        n = g["slide"]
        d = LEAD + dur[n] + TAIL
        seg = seg_dir / f"{n:02d}.mp4"
        audio = ["-i", str(OUT / "audio" / f"{n:02d}.wav")]
        afilt = f"adelay={int(LEAD * 1000)}:all=1,apad,atrim=0:{d:.3f},aresample=48000"
        vfade = f"fade=t=in:st=0:d=0.35,fade=t=out:st={d - 0.35:.3f}:d=0.35,format=yuv420p"
        if g.get("live"):
            video = ["-ss", "0.8", "-t", f"{d:.3f}", "-i", str(OUT / "live" / f"slide{n:02d}.webm")]
            vfilt = f"fps={FPS},scale=1920:1080,tpad=stop_mode=clone:stop_duration={d:.3f},trim=0:{d:.3f},{vfade}"
        else:
            video = ["-loop", "1", "-framerate", str(FPS), "-t", f"{d:.3f}", "-i", str(OUT / "shots" / f"{n:02d}.png")]
            vfilt = f"scale=1920:1080,{vfade}"
        run(*video, *audio, "-filter:v", vfilt, "-filter:a", afilt, "-t", f"{d:.3f}",
            "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-r", str(FPS), "-c:a", "aac", "-b:a", "160k",
            str(seg))
        # Subtítulos: el texto se reparte por longitud a lo largo de la narración.
        parts = chunks(g["sub"])
        total = sum(len(p) for p in parts)
        cur = t0 + LEAD
        for p in parts:
            span = dur[n] * len(p) / total
            srt.append((cur, cur + span, p))
            cur += span
        segs.append(seg)
        t0 += d
    (OUT / "segments.txt").write_text("".join(f"file '{s}'\n" for s in segs))
    srt_path = OUT / "qhago-scanner-presentacion.srt"
    srt_path.write_text("\n".join(f"{i}\n{ts(a)} --> {ts(b)}\n{txt}\n" for i, (a, b, txt) in enumerate(srt, 1)))
    joined = OUT / "joined.mp4"
    run("-f", "concat", "-safe", "0", "-i", str(OUT / "segments.txt"), "-c", "copy", str(joined))
    style = ("FontName=DejaVu Sans,FontSize=17,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BackColour=&H99000000,"
             "BorderStyle=4,Outline=1,Shadow=0,MarginV=28")
    final = OUT / "qhago-scanner-presentacion.mp4"
    run("-i", str(joined), "-vf", f"subtitles={srt_path}:force_style='{style}'", "-c:v", "libx264", "-preset", "medium",
        "-crf", "20", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
        "-movflags", "+faststart", str(final))
    print(f"{final} ({t0:.1f} s)")


if __name__ == "__main__":
    main()
