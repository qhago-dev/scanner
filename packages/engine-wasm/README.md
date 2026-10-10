# @qhago/engine-wasm (privado)

Compila ZXing-C++ (submódulo `vendor/zxing-cpp`, solo lectores) junto con el bridge de `src/` a WebAssembly.
Lo consume `@qhago/scanner`; no se publica.

```bash
git submodule update --init
bash packages/engine-wasm/build.sh          # all = browser + node
bash packages/engine-wasm/build.sh browser  # solo navegador
```

- Versión de Emscripten fijada en `.emsdk-version`. El script busca `emcc` en el PATH, en `$EMSDK` o en `~/emsdk`.
- Sin emsdk instalado: `docker run --rm -v "$PWD":/src -w /src emscripten/emsdk:$(cat packages/engine-wasm/.emsdk-version) bash packages/engine-wasm/build.sh`
- Salida: `out/browser/qhago_engine.{mjs,wasm}` (`ENVIRONMENT=web,worker`) y `out/node/…` (`ENVIRONMENT=node`, con decoder de imágenes).
- Las funciones exportadas se declaran en `exports.txt`.
- Cada build escribe `out/<target>/size.json` (bytes raw y gzip).
