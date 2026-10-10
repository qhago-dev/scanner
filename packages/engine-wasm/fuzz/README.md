# Fuzzing del motor (F6.5)

`bash fuzz/run.sh [segundos]` compila ZXing + el puente con libFuzzer, ASan y UBSan y fuzzea la ABI C (`sa_read`,
`sa_read_rgba`, `sa_read_quad`, `sa_decode_image`). El corpus y los artefactos quedan en `build/fuzz/` (fuera de git).
CI: 60 s en PR no; 1 h en el workflow nocturno (`bench.yml`).

## Hallazgos

| Fecha | Dónde | Qué | Estado |
|---|---|---|---|
| 2026-10-10 | `src/cascade.cpp` (nuestro) | Máscara de formatos solo con bits desconocidos → `BarcodeFormats{}` = *Any* en ZXing → lectores fuera de los 13 formatos | Corregido: la máscara se recorta a los 13 |
| 2026-10-10 | `src/warp.cpp` (nuestro) | Cuadrilátero degenerado/NaN → homografía no finita → cast float→int indefinido | Corregido: puntos no finitos rechazados, homografía degenerada = todo fuera |
| 2026-10-10 | ZXing-C++ 3.1.1 `LocalGrid.cpp:52` (DataMatrix) | `int(6 * modSize)` con `modSize` NaN | Upstream, misma clase; inocuo en WASM. Suprimido (clase `float-cast-overflow`, solo en `vendor/`) |
| 2026-10-10 | ZXing-C++ 3.1.1 `MicroPDFReader.cpp:537` | `meanCount` = suma / 0 codewords → NaN → `int` | Upstream, misma clase; inocuo en WASM. Suprimido |
| 2026-10-10 | ZXing-C++ 3.1.1 `Pattern.h:329` | `NormalizedE2EPattern` con patrón de suma 0 → NaN → `int` (vía `MicroPdf417::ReadRAP`, alcanzable con `pdf417`) | Upstream. Inocuo en WASM (`nontrapping-fptoint` satura). Suprimido en `ubsan.supp`; reporte preparado abajo |

### Reporte para upstream (pendiente de enviar; acción externa)

> **NormalizedE2EPattern: float-cast-overflow (NaN → int) when the pattern sum is 0**
> ZXing-C++ v3.1.1, `core/src/Pattern.h:329`. With UBSan, `MicroPdf417::ReadRAP` → `NormalizedE2EPattern<6,10,5>`
> divides by `moduleSize == 0` and converts NaN to `int`. Reproducible with fuzzed luma images when PDF417 is enabled.
> Suggested fix: return an all-zero/invalid pattern when `view.sum(LEN) == 0`. Same class in
> `pdf417/MicroPDFReader.cpp:537` (`meanCount` divided by a zero `count_if`).

Mejora posible: pedir a ZXing solo las variantes PDF417/CompactPDF417 (MicroPDF417 no está entre los 13 formatos
y sus lecturas se descartan): ahorra trabajo y evita esta ruta. Requiere verificar que no cambian las lecturas de PDF417.
