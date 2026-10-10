#!/usr/bin/env bash
# Vídeo narrado de la presentación: TTS local (Kokoro-82M por defecto, o Piper) + capturas (Playwright) + montaje
# (ffmpeg con libass). Sin servicios externos.
#   KOKORO=<dir pip --target con kokoro> bash apps/demo/video/make.sh          # voz ef_dora, es-419
#   ENGINE=piper PIPER=<dir> VOICE=<voz.onnx> bash apps/demo/video/make.sh
# Kokoro importa spaCy solo para inglés: si no está instalado, pon en PYTHONPATH un stub `spacy.py`.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "${ENGINE:-kokoro}" == kokoro ]]; then
  : "${KOKORO:?ruta de kokoro (pip --target)}"
  PYTHONPATH="$KOKORO${STUBS:+:$STUBS}" python3 "$HERE/tts.py" --voice "${VOICE:-ef_dora}" --speed "${SPEED:-0.95}"
else
  : "${PIPER:?ruta de piper-tts}" "${VOICE:?voz .onnx}"
  PYTHONPATH="$PIPER" python3 "$HERE/tts.py" --engine piper --voice "$VOICE" --speed "${SPEED:-0.95}"
fi
cd "$HERE/.." && bunx vite build >/dev/null
bunx vite preview --port 4719 --strictPort >/dev/null 2>&1 &
PREVIEW=$!
trap 'kill $PREVIEW' EXIT
sleep 3
BASE=http://localhost:4719 node "$HERE/record.mjs"
python3 "$HERE/assemble.py"
