# Barrido en rebanadas vs barrido completo (vídeo, tiempo real simulado)

Motivo: prueba en Android 10 (Chrome 155, 8 núcleos, 4 GB) con `apps/demo/debug-server.ts`. Sin código en
cuadro, cada frame escalaba al thorough completo (13 pasadas, ~650 ms) y la lectura tardaba 2,3–3,7 s
(una vez 7,8 s). Ninguna de las 11 fotos "miss" de la sesión se recupera con thorough (eran movidas o sin
código); las 8 "detect" se leen con `fast` en ~8 ms.

`bun run runners/video.ts --dataset synthetic-video --engines qhago [--slowdown 10]`

| Split | ×CPU | Versión | % leídos | ttfr p50 | ttfr p95 | Descartados |
|---|---|---|---|---|---|---|
| dev | 1 | completo | 81,1 % | 1002 | 2205 | 783 |
| dev | 1 | rebanadas | 79,2 % | 936 | 2202 | 0 |
| test | 1 | completo | 73,7 % | 603 | 2069 | 895 |
| test | 1 | rebanadas | 73,7 % | 602 | 2337 | 1 |
| dev | 10 | completo | 75,5 % | 1104 | 2630 | 2388 |
| dev | 10 | rebanadas | 77,4 % | 1291 | 2692 | 1856 |

Pareado (vídeos leídos por ambas): dev ×10 Δttfr mediana −68 ms (mejora en 22, empeora en 12);
test ×1 mejora en 6, empeora en 1. Diferencias de lectura: dev ×1 −1 vídeo (codabar-0020, lo leía CLAHE en
el barrido completo); dev ×10 −1 / +2. Con ×10 las medidas son ruidosas (×10 amplifica el jitter).

Pendiente: confirmar en el dispositivo real (mismo Android) con el modo depuración.
