# Fase 9 — Tareas

- [x] M1 ritmo del worker por mediana acotada (`0660137`)
- [x] M2 IA ≤ 25 % del tiempo de vídeo (`3a4c114`)
- [x] M3 EAN de escalado confirmado en 2 frames (`3a4c114`)
- [x] M6 conjunto `device`: veredictos manuales de las sesiones y `bench/dataset/device/build.py` (302 fotos)
- [x] M6 línea base en `device` (`bench/device-eval.ts`, `bench/runners/device-cam.ts`)
- [x] Extra: EAN con confianza < 1 confirmado en 2 frames (`5e25efc`)
- [x] M4 `deblur-ean` en TS (localización, perfiles, tramo, deconvolución, DP, geometría)
- [x] M4 tests unitarios: perfiles sintéticos desenfocados (σ 0,3-1,2), invertidos, ruido; negativos
- [x] M4 integración en `decode()` (fallback + verificación cruzada) y en la sesión (paso propio, alterna con el barrido). Cajas IA: pendiente
- [x] M4 validación: `device`, `public` dev/test, vídeo, zxing-cpp; coste por línea
- [ ] M7 promediado de perfiles entre frames (condicionado a M4)
- [ ] Guía "escáner para tiendas" (`docs/guias/`): formatos recomendados, consejos de distancia/luz

Resultados: `bench/results/2026-10-11-fase9-deblur.md`.
