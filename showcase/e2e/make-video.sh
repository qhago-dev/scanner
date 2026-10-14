#!/usr/bin/env bash
# Genera e2e/.cache/fixture.y4m (cámara simulada de Chromium: --use-file-for-fake-video-capture) a partir de
# public/fixture.png (EAN-13 5901234123457): 640x480, 15 fps, 2 s, el código se desplaza 4 px/frame.
# Requiere ffmpeg (en CI: sudo apt-get install -y ffmpeg). El .y4m no se versiona (~14 MB sin comprimir).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$HERE/.cache"
ffmpeg -loglevel error -y -f lavfi -i "color=c=0xe0e0e0:s=640x480:r=15:d=2" -i "$HERE/../public/fixture.png" \
  -filter_complex "[0][1]overlay=x='60+4*n':y=150:format=auto,format=yuv420p" -frames:v 30 \
  -f yuv4mpegpipe "$HERE/.cache/fixture.y4m"
echo "vídeo en $HERE/.cache/fixture.y4m"
