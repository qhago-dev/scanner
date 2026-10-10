#!/usr/bin/env bash
# Genera los clips de cámara simulada para tests (F3/F6) en test/.cache/:
#   ean13-moving.y4m  (Chromium: --use-file-for-fake-video-capture; I420 → ejercita el plano Y de VideoFrame)
#   ean13-moving/NNN.png (Firefox/WebKit: shim de getUserMedia con canvas.captureStream)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$HERE/test/.cache"
mkdir -p "$OUT/ean13-moving"
SRC="$HERE/test/fixtures/ean13-synthetic.png"
# 640x480, fondo gris claro, el código se desplaza 4 px/frame en horizontal (30 frames, 15 fps).
ffmpeg -loglevel error -y -f lavfi -i "color=c=0xe0e0e0:s=640x480:r=15:d=2" -i "$SRC" \
  -filter_complex "[0][1]overlay=x='60+4*n':y=150:format=auto,format=yuv420p" -frames:v 30 \
  -f yuv4mpegpipe "$OUT/ean13-moving.y4m"
ffmpeg -loglevel error -y -i "$OUT/ean13-moving.y4m" "$OUT/ean13-moving/%03d.png"
echo "clips en $OUT"
