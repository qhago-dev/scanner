# Compliance de licencias

Política (ADR-09, `docs/roadmap-v1/00-decisiones.md`): código propio MIT; solo dependencias MIT, Apache-2.0, BSD o ISC. Prohibidas GPL, AGPL, LGPL, SSPL, BUSL y cualquier derivado de Ultralytics/YOLO.

## Auditoría del WASM (F0.4, 2026-10-10)

`license-checker` no ve el código C/C++ enlazado en el WASM, así que se audita a mano en cada actualización del submódulo.

| Componente | Versión | Licencia | Se enlaza en |
|---|---|---|---|
| ZXing-C++ (núcleo, lectores) | v3.1.1 | Apache-2.0 | navegador + node |
| librscpp (dentro de ZXing) | v3.1.1 | Apache-2.0 | navegador + node |
| libzueci (dentro de ZXing) | v3.1.1 | BSD-3-Clause | navegador + node |
| libzint (dentro de ZXing) | — | BSD-3-Clause | **no** (solo con writers) |
| Runtime de Emscripten | 6.0.2 | MIT | navegador + node |
| libc++ / libc++abi | (Emscripten 6.0.2) | Apache-2.0 WITH LLVM-exception | navegador + node |
| musl | (Emscripten 6.0.2) | MIT | navegador + node |
| stb_image | v2.30 | MIT / dominio público | solo node |

## Dependencias npm de runtime

Se verifican en CI con `license-checker --production --failOn 'GPL;AGPL;LGPL;SSPL;BUSL'`.

## Datasets y modelos

Ver ADR-09 y ADR-12: licencia registrada por fuente; solo `own`, CC0 o CC-BY para entrenar modelos publicados.
