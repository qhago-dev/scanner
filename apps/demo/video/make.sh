#!/usr/bin/env bash
# Genera el vídeo narrado de la presentación: TTS local (Piper) + capturas (Playwright) + montaje (ffmpeg).
# Requisitos: ffmpeg con libass, `pip install --target <dir> piper-tts` y una voz de rhasspy/piper-voices.
#   PIPER=<dir> VOICE=<voz.onnx> bash apps/demo/video/make.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${PIPER:?ruta de piper-tts (pip --target)}"
: "${VOICE:?ruta de la voz .onnx (p. ej. es_MX-claude-high.onnx)}"
PYTHONPATH="$PIPER" python3 "$HERE/tts.py" --voice "$VOICE" --speed "${SPEED:-1.05}"
cd "$HERE/.." && bunx vite build >/dev/null
bunx vite preview --port 4719 --strictPort >/dev/null 2>&1 &
PREVIEW=$!
trap 'kill $PREVIEW' EXIT
sleep 3
BASE=http://localhost:4719 node "$HERE/record.mjs"
python3 "$HERE/assemble.py"
