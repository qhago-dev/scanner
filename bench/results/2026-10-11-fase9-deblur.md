# Fase 9 · M4 — lector EAN por deconvolución (deblur-ean)

Conjunto `device` (fotos reales del Android 10 con veredicto manual; split por sesión, test nunca usado para
ajustar). "legible" = el código completo se lee a simple vista.

## Fotos (`decode()` balanced) — `bench/device-eval.ts`

| Split | Antes | Ahora | Falsas antes → ahora | p95 |
|---|---|---|---|---|
| dev (61 legibles) | 34 | **41** | 2 → 1 | 259 → ~500 ms |
| test (63 legibles) | 33 | **40** | 1 → 1 | 110 → 433 ms |
| test, dudosas (51) | 6 | **11** | — | |

Con IA (test): 48 → 49 legibles. zxing-wasm (test): 32 legibles, 4 falsas.

## Cámara simulada (`bench/runners/device-cam.ts`, ×5 CPU, foto repetida como vídeo quieto 3 s)

| Split | Antes | Ahora | Falsas |
|---|---|---|---|
| dev | 23 | **29** | iguales (desodorante arrugado, ver abajo) |
| test | 24 | **29** | 0 → 0 |

## Fotos públicas (`public/test`, 1 840)

| Motor | Recall | Desenfocadas (152) | Lecturas falsas |
|---|---|---|---|
| qhago | 76,6 → **80,2 %** | 11,8 → **53,9 %** | idénticas foto a foto con y sin M4 |
| qhago+ai | 83,9 → **85,9 %** | 32,9 → **57,9 %** | 9 → 9 |

Muestras zxing-cpp: un cambio, `upca-4/2.png` pasa de una lectura falsa a la correcta
(verificación cruzada). Vídeo sintético dev: 79,2 % igual.

## Límites conocidos

- Envase flexible arrugado (desodorante 7501033204265): la arruga deforma la mitad izquierda de forma
  consistente; ZXing, zxing-wasm y el propio deblur ven 2548033204265 en la foto 0046. Solo se resolvería
  leyendo los dígitos impresos (M12).
- Coste: ~13 ms por línea y ~14 ms por localización en escritorio (≈ ×5-10 en el teléfono); en la cámara se
  reparte (una línea por turno, ≤ 30 % del tiempo).
