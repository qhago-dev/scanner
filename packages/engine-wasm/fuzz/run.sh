#!/usr/bin/env bash
# Fuzzing nativo del motor (F6.5): libFuzzer + ASan + UBSan sobre la ABI C (bridge + cascada + warp + stb_image).
# Uso: bash packages/engine-wasm/fuzz/run.sh [segundos=60]   (CI nocturno: 3600)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="$HERE/vendor/zxing-cpp"
BUILD="$HERE/build/fuzz"
SECS="${1:-60}"
SAN="-fsanitize=address,undefined -fno-sanitize-recover=undefined -fsanitize-recover=float-cast-overflow -fno-omit-frame-pointer -g -O1"
mkdir -p "$BUILD/corpus" "$BUILD/artifacts"

if [[ ! -f "$BUILD/zxing/core/libZXing.a" ]]; then
  CC=clang CXX=clang++ cmake -S "$VENDOR" -B "$BUILD/zxing" -DCMAKE_BUILD_TYPE=RelWithDebInfo \
    -DCMAKE_CXX_FLAGS="$SAN -fsanitize=fuzzer-no-link" -DZXING_READERS=ON -DZXING_WRITERS=OFF \
    -DZXING_C_API=OFF -DZXING_EXAMPLES=OFF -DBUILD_SHARED_LIBS=OFF >/dev/null
fi
cmake --build "$BUILD/zxing" -j"$(nproc)" >/dev/null
# shellcheck disable=SC2086
clang++ -std=c++20 $SAN -fsanitize=fuzzer -DQHAGO_WITH_IMAGE_DECODER \
  -I "$VENDOR/core/src" -I "$BUILD/zxing/core" -I "$HERE/src" -I "$HERE/third_party" \
  "$HERE"/src/*.cpp "$HERE/third_party/stb_image_impl.cpp" "$HERE/fuzz/fuzz_abi.cpp" \
  "$BUILD/zxing/core/libZXing.a" -o "$BUILD/fuzz_abi"

# Semillas: unos PNG de los samples (modo 3) para que stb_image arranque con estructura válida.
if [[ -d "$HERE/build/samples" && -z "$(ls -A "$BUILD/corpus")" ]]; then
  for f in $(find "$HERE/build/samples" -name '*.png' -size -20k | head -20); do
    { printf '\x03\x40\x40'; head -c 42 /dev/zero; cat "$f"; } > "$BUILD/corpus/$(basename "$f")"
  done
fi
UBSAN_OPTIONS="print_stacktrace=1:halt_on_error=1:suppressions=$HERE/fuzz/ubsan.supp" "$BUILD/fuzz_abi" "$BUILD/corpus" -max_total_time="$SECS" -max_len=65536 \
  -rss_limit_mb=2048 -timeout=10 -artifact_prefix="$BUILD/artifacts/" -print_final_stats=1 2>&1 | tail -15
