#!/usr/bin/env bash
# Compila ZXing-C++ (solo lectores) + el bridge de Qhago a WebAssembly.
#
# Uso:  bash packages/engine-wasm/build.sh [browser|node|all]   (default: all)
# Requiere emsdk en la versión de .emsdk-version. Busca, en orden: emcc en PATH,
# $EMSDK/emsdk_env.sh, ~/emsdk/emsdk_env.sh. Alternativa sin instalar nada:
#   docker run --rm -v "$PWD":/src -w /src emscripten/emsdk:$(cat packages/engine-wasm/.emsdk-version) \
#     bash packages/engine-wasm/build.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-all}"
EMSDK_VERSION="$(tr -d '[:space:]' < "$HERE/.emsdk-version")"
VENDOR="$HERE/vendor/zxing-cpp"
BUILD="$HERE/build"
OUT="$HERE/out"

log() { printf '\033[1;34m[engine-wasm]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[engine-wasm]\033[0m %s\n' "$*" >&2; exit 1; }

if ! command -v emcc >/dev/null 2>&1; then
  for env in "${EMSDK:-}/emsdk_env.sh" "$HOME/emsdk/emsdk_env.sh"; do
    if [[ -f "$env" ]]; then
      # shellcheck disable=SC1090
      source "$env" >/dev/null 2>&1
      break
    fi
  done
fi
command -v emcc >/dev/null 2>&1 || die "emcc no encontrado. Instala emsdk $EMSDK_VERSION o usa la imagen Docker (ver cabecera)."
EMCC_VERSION="$(emcc --version | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
[[ "$EMCC_VERSION" == "$EMSDK_VERSION" ]] || die "emcc $EMCC_VERSION != $EMSDK_VERSION (.emsdk-version)."
[[ -f "$VENDOR/CMakeLists.txt" ]] || die "Falta el submódulo: git submodule update --init"

# Mismas flags de compilación para ZXing y el bridge (LTO y wasm EH deben coincidir).
COMMON_FLAGS="-Oz -flto -fwasm-exceptions"

build_zxing() {
  local dir="$BUILD/zxing"
  if [[ ! -f "$dir/core/libZXing.a" ]]; then
    log "Configurando ZXing-C++ (solo lectores)…"
    local gen=()
    command -v ninja >/dev/null 2>&1 && gen=(-G Ninja)
    emcmake cmake -S "$VENDOR" -B "$dir" "${gen[@]}" -DCMAKE_BUILD_TYPE=MinSizeRel \
      -DZXING_READERS=ON -DZXING_WRITERS=OFF -DZXING_C_API=OFF -DZXING_EXAMPLES=OFF \
      -DZXING_BLACKBOX_TESTS=OFF -DZXING_UNIT_TESTS=OFF -DBUILD_SHARED_LIBS=OFF \
      -DCMAKE_CXX_FLAGS="$COMMON_FLAGS" -DCMAKE_C_FLAGS="$COMMON_FLAGS" >/dev/null
  fi
  log "Compilando ZXing-C++…"
  cmake --build "$dir" -j"$(nproc 2>/dev/null || echo 4)" >/dev/null
}

# Exporta las funciones listadas en exports.txt (Emscripten no admite comodines).
exported_functions() {
  grep -vE '^\s*(#|$)' "$HERE/exports.txt" | sed 's/^/_/' | paste -sd, -
}

link_target() {
  local name="$1" env="$2"; shift 2
  local dest="$OUT/$name"
  local base="qhago_engine"
  [[ "$name" == "node" ]] && base="qhago_engine_node"
  mkdir -p "$dest"
  log "Enlazando $name (ENVIRONMENT=$env)…"
  # shellcheck disable=SC2086
  em++ $COMMON_FLAGS -std=c++20 \
    -I "$VENDOR/core/src" -I "$BUILD/zxing/core" -I "$HERE/src" \
    "$HERE"/src/*.cpp "$@" -I "$HERE/third_party" "$BUILD/zxing/core/libZXing.a" \
    -sMODULARIZE -sEXPORT_ES6 -sEXPORT_NAME=createQhagoEngine -sENVIRONMENT="$env" \
    -sALLOW_MEMORY_GROWTH -sINITIAL_MEMORY=16MB -sFILESYSTEM=0 -sASSERTIONS=0 \
    -sDYNAMIC_EXECUTION=0 -sINCOMING_MODULE_JS_API=wasmBinary,instantiateWasm,locateFile \
    -sEXPORTED_FUNCTIONS="$(exported_functions),_malloc,_free" \
    -sEXPORTED_RUNTIME_METHODS=HEAPU8 \
    -o "$dest/$base.mjs"
  # El glue nunca debe contener top-level await (rompe require(esm) y bundlers).
  if grep -qE '^\s*await |[;}]\s*await import\(' "$dest/$base.mjs"; then
    die "$name: el glue contiene top-level await"
  fi
  # CSP estricta (F6.6): sin eval ni new Function (DYNAMIC_EXECUTION=0 debe garantizarlo).
  if grep -qE '\beval\(|new Function\(' "$dest/$base.mjs"; then
    die "$name: el glue usa eval/new Function (rompe CSP sin 'unsafe-eval')"
  fi
  local raw gz
  raw=$(wc -c < "$dest/$base.wasm"); gz=$(gzip -9 -c "$dest/$base.wasm" | wc -c)
  log "$name: wasm $((raw / 1024)) KB raw, $((gz / 1024)) KB gzip"
  printf '{"target":"%s","rawBytes":%d,"gzipBytes":%d}\n' "$name" "$raw" "$gz" > "$dest/size.json"
}

build_zxing
# El artefacto node incluye el decoder PNG/JPEG (stb_image) cuando está disponible.
link_node() {
  if [[ -f "$HERE/third_party/stb_image_impl.cpp" ]]; then
    link_target node node -DQHAGO_WITH_IMAGE_DECODER "$HERE/third_party/stb_image_impl.cpp"
  else
    link_target node node
  fi
}

case "$TARGET" in
  browser) link_target browser web,worker ;;
  node) link_node ;;
  all) link_target browser web,worker; link_node ;;
  *) die "Target desconocido: $TARGET (browser|node|all)" ;;
esac
log "Listo → $OUT"
