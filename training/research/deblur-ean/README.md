# Prototipo: EAN-13 robusto al desenfoque (deconvolución en la cuadrícula de módulos)

Motivación (prueba en Android 10, 2026-10-10, 91 fotos revisadas a mano): de 44 fotos con un EAN completo y
legible a simple vista, `fast` leía 14, `thorough` 23, zxing-wasm 20 y qhago+IA 27. Causa: desenfoque leve de
~1 módulo (3-4 px/módulo a 720p) que hace que las barras y espacios de 1 módulo no crucen ningún umbral.

Método: localización por tensor de estructura → perfiles perpendiculares a las barras promediados en banda →
tramo entre zonas de silencio → remuestreo a 6 muestras/módulo → deconvolución lineal (mínimos cuadrados
regularizados con la matriz de desenfoque gaussiano, precalculada por σ) → puntuación de dígitos L/G/R →
programación dinámica con checksum y paridad → búsqueda de geometría (inicio, ancho, curvatura, σ) maximizando
la correlación del modelo completo → aceptación con ajuste ≥ 0,85, margen ≥ 0,8 y ≥ 2 líneas de acuerdo.

Resultado en esas 91 fotos: 21/44 legibles, 3/21 dudosas, **0 falsas** (también 0 en las 26 sin código).
Unión con el motor: `fast` 14 → 24, `balanced` 22 → 27, qhago+IA 27 → 29.

`python3 run_par.py <carpeta-con-veredictos.json> out.json` (lento en Python: ~3 min de CPU por foto; la
versión TS debe hacer la búsqueda de grueso a fino).
