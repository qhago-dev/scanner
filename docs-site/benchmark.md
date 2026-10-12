# Benchmark y metodología

Todas las cifras de la documentación salen de `bench/` (reproducible, con fecha y commit). Metodología:

- Mismos píxeles para todos los motores; comparaciones **pareadas** con IC 95 % por bootstrap agrupado por objeto
  físico (un mismo producto nunca está en dos splits).
- Splits `dev` (ajuste), `test` (gates y cierres, cada ejecución registrada) y `holdout` (solo release).
- Lecturas falsas: texto incorrecto, lecturas de más en muestras completas y cualquier lectura en negativas; en
  tasas con 0 eventos se informa la cota superior al 95 %.
- Datasets: fotos públicas reales (ArTe-Lab, KAIST; Muenster solo para evaluación: se informa también la cifra
  "publicable" sin él), desenfoque y negativas derivados, muestras de zxing-cpp, vídeo sintético y fotos propias
  del dispositivo. Fuentes y licencias en `bench/dataset/SOURCES.md`.

<!--@include: ../bench/results/2026-10-12-f10-baseline.md-->

<!--@include: ../bench/results/2026-10-12-f10-cierre.md-->
