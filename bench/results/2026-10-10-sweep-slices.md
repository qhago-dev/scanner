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

## Segunda prueba en el Android (con rebanadas) y ajustes

Frames con escalado: p50 665 → 135 ms. Por rebanada en el teléfono: CLAHE ~130 ms, unsharp+recortes ~110 ms,
multiescala ~500 ms → la multiescala pasa a tener su propio límite (`HEAVY_DUTY` = 10 % del tiempo).
Vídeo dev: ×1 79,2 % (igual), ×10 77,4 % (base 75,5 %), p95 2 490 ms (base 2 630).

La foto `0019-miss` (7750670011839, borrosa) devolvía con balanced/thorough **dos EAN-13 falsos con checksum
válido** (9238472016651, 3716652077839) → regla de conflictos 1D (`src/conflicts.ts`).

## Tercera prueba en el Android

Frames con escalado p50 130 ms (máx. 605, la multiescala). Nueva lectura falsa con checksum válido en un envase
arrugado (7501033204265 → 2548033204265, fotos 0059/0062), sin otra lectura con la que entrar en conflicto;
zxing-wasm upstream la reproduce y `minLineCount` no la evita. Una relectura normal (x2/x0,5) de la zona da el
valor real según el recorte → `verifyHarder` (2 vistas). public/test: recall 76,6 %, falsas 7, p95 327 ms
(4 vistas: falsas 6, p95 422 ms).
