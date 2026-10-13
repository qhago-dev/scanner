#!/usr/bin/env bash
# Paridad WASM ↔ nativo (F2.2, gate G2). Compila test/parity_main.cpp contra ZXing nativo (c++ del sistema)
# y contra ZXing WASM (em++, ejecutado con node) y compara las salidas línea a línea.
# Uso: bash packages/engine-wasm/test/parity.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="$HERE/vendor/zxing-cpp"
BUILD="$HERE/build"
SAMPLES="$BUILD/samples"   # WebP convertidos a PNG (test/prepare-samples.py)
OUT="$BUILD/parity"
mkdir -p "$OUT"
SRC=("$HERE/src/cascade.cpp" "$HERE/src/preprocess.cpp" "$HERE/third_party/stb_image_impl.cpp" "$HERE/test/parity_main.cpp")
INC=(-I "$VENDOR/core/src" -I "$HERE/src" -I "$HERE/third_party")

python3 "$HERE/test/prepare-samples.py" "$VENDOR/test/samples" "$SAMPLES" >/dev/null

# 1) Nativo
if [[ ! -f "$BUILD/native-zxing/core/libZXing.a" ]]; then
  cmake -S "$VENDOR" -B "$BUILD/native-zxing" -DCMAKE_BUILD_TYPE=Release -DZXING_READERS=ON -DZXING_WRITERS=OFF \
    -DZXING_C_API=OFF -DZXING_EXAMPLES=OFF -DBUILD_SHARED_LIBS=OFF >/dev/null
fi
cmake --build "$BUILD/native-zxing" -j"$(nproc)" >/dev/null
"${CXX:-c++}" -O2 -std=c++20 "${INC[@]}" -I "$BUILD/native-zxing/core" "${SRC[@]}" "$BUILD/native-zxing/core/libZXing.a" -o "$OUT/parity-native"

# 2) WASM (mismas flags que build.sh; NODERAWFS para leer los samples desde node)
bash "$HERE/build.sh" browser >/dev/null   # asegura build/zxing (libZXing.a de wasm)
if ! command -v em++ >/dev/null 2>&1; then source "${EMSDK:-$HOME/emsdk}/emsdk_env.sh" >/dev/null 2>&1; fi
em++ -Oz -flto -fwasm-exceptions -std=c++20 "${INC[@]}" -I "$BUILD/zxing/core" "${SRC[@]}" "$BUILD/zxing/core/libZXing.a" \
  -sNODERAWFS=1 -sALLOW_MEMORY_GROWTH -sENVIRONMENT=node -o "$OUT/parity-wasm.js"

"$OUT/parity-native" "$SAMPLES" > "$OUT/native.txt"
node "$OUT/parity-wasm.js" "$SAMPLES" > "$OUT/wasm.txt"

lines=$(wc -l < "$OUT/native.txt")
read_native=$(awk -F'|' '$4>0' "$OUT/native.txt" | wc -l)
if diff -q "$OUT/native.txt" "$OUT/wasm.txt" >/dev/null; then
  echo "PARIDAD OK: $lines combinaciones idénticas ($read_native con lectura)."
else
  echo "PARIDAD FALLIDA: $(diff "$OUT/native.txt" "$OUT/wasm.txt" | grep -c '^<') diferencias (ver $OUT)." >&2
  diff "$OUT/native.txt" "$OUT/wasm.txt" | head -20 >&2
  exit 1
fi
