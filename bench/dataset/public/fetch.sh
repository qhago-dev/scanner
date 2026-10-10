#!/usr/bin/env bash
# Descarga los datasets públicos reales (fotos de móvil) a raw/ (fuera de git). Licencias en ../SOURCES.md.
# Uso: bash bench/dataset/public/fetch.sh && python3 -I bench/dataset/public/import.py
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAW="$HERE/raw"
mkdir -p "$RAW"
get() { # url destino
  [[ -s "$2" ]] && return 0
  echo "↓ $(basename "$2")"
  curl -fSL --retry 5 --retry-delay 10 -o "$2.part" "$1" && mv "$2.part" "$2"
}
ART=https://artelab.dista.uninsubria.it/downloads/datasets/barcode
get "$ART/medium_barcode_1d/medium_barcode_1d.zip" "$RAW/artelab_medium.zip"
ZEN=https://zenodo.org/api/records/13586402/files
get "$ZEN/real.zip/content" "$RAW/kaist_real.zip"
get "$ZEN/e8_bb.zip/content" "$RAW/kaist_e8.zip"
for z in artelab_medium kaist_real kaist_e8; do
  [[ -d "$RAW/$z" ]] || unzip -q -o "$RAW/$z.zip" -d "$RAW/$z"
done
echo "listo → $RAW"
