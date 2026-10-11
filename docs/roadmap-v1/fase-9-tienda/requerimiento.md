# Fase 9 — Escáner para tiendas (bodegas) con el celular que ya tienen

## Objetivo

Que el dueño de una bodega escanee productos con su celular de gama media, sin lector dedicado, y lo sienta
**rápido** (lee en < 1 s al apuntar a un código enfocable) y **confiable** (nunca un producto equivocado).

Caso de uso: EAN-13/EAN-8/UPC (productos), QR (pagos tipo Yape/Plin, catálogos), Code 128 (códigos internos).
Dispositivo de referencia: Android 10, Chrome 155, 8 núcleos, 4 GB (el de las pruebas), cámara 720p.

## Evidencia de partida (pruebas en el dispositivo, 2026-10-10)

| Hallazgo | Medida |
|---|---|
| Ritmo del worker fijado por el frame más lento | tras cargar la IA, 1 frame cada 5,8 s toda la sesión |
| Inferencia IA bloqueante | 1,1-3 s por frame con IA |
| Desenfoque leve de ~1 módulo (3-4 px/módulo) | de 44 fotos legibles a simple vista: `fast` 14, `thorough` 23, zxing-wasm 20, IA 27 |
| Lecturas falsas EAN con checksum válido | envases arrugados/borrosos (3 en fotos, 1 en vivo) |
| Localización | el detector IA encuentra el código en 13/14 fotos no leídas (no es el cuello de botella) |

## Criterios de aprobación (para toda mejora)

1. Mejora una métrica medida: lecturas correctas en el conjunto del dispositivo (`device`), recall en
   `public`, ttfr en vídeo, o fps en el teléfono.
2. **Cero lecturas falsas nuevas** en `device`, `public` y las muestras de zxing-cpp.
3. Sin regresión: `public/test` recall ≥ −0,5 pp, vídeo dev ≥ −1 vídeo, tests verdes.
4. Coste en el teléfono: ningún frame de cámara > ~150 ms por la mejora (se reparte en rebanadas si hace falta).

## Mejoras analizadas

| # | Mejora | Análisis | Decisión |
|---|---|---|---|
| M1 | Ritmo del worker por mediana acotada | Causa principal de la lentitud en vivo. Test de regresión con el caso real | **Aprobada · hecha** (`0660137`) |
| M2 | IA ≤ 25 % del tiempo de vídeo | Evita frames de 1-3 s; la IA sigue ayudando en fallback | **Aprobada · hecha** (`3a4c114`) |
| M3 | EAN de escalado confirmado en 2 frames | Bloquea la lectura falsa vista en vivo; vídeo dev igual | **Aprobada · hecha** (`3a4c114`) |
| M4 | Decodificador EAN resistente al desenfoque (deconvolución + DP con checksum) | Prototipo: 21/44 legibles, 0 falsas; `fast`+M4 14 → 24. Ataca el cuello de botella real. Riesgo: falsos → ajuste del modelo + margen + varias líneas + 2 frames en vídeo | **Aprobada** — ver diseño |
| M5 | Localización para M4: tensor de estructura + cajas IA + tracks sin leer | Necesaria para M4; la IA ya localiza bien (13/14) | **Aprobada** (parte de M4) |
| M6 | Conjunto de evaluación `device` (fotos reales con veredicto manual, local, privado) | Sin él no se puede aprobar nada de lo demás con datos | **Aprobada** (primero) |
| M7 | Promediar perfiles del mismo track entre frames antes de M4 | Más SNR y estabilidad; depende de M4 | Aprobada condicionada: tras medir M4 |
| M8 | Preset de formatos para tienda | Menos formatos = menos tiempo y menos falsos; ya se puede con `formats` | Rechazada como API nueva: se documenta el `formats` recomendado |
| M9 | Zoom 1,5-2× por defecto | Podría alejar al usuario a la distancia de enfoque; no se puede medir sin dispositivo | Pendiente de prueba en dispositivo (control de zoom ya existe en la demo) |
| M10 | Re-enfoque automático si no lee en 2 s | Solo verificable en dispositivo; riesgo de que el enfoque "bombee" | Pendiente de prueba en dispositivo |
| M11 | Detector tipo YOLO más grande | La localización ya acierta (13/14); sería más lento (~1 s por inferencia ya hoy) | **Rechazada** con datos |
| M12 | Red que lea los dígitos (barras o texto impreso) | Útil para arrugados/reflejos (desodorante), pero exige dataset y control de falsos | Posterior (fase propia) tras M4 |
| M13 | Regla de "poco respaldo" (≤ 2 líneas) | zxing-cpp: −7 correctas, 0 falsas | **Rechazada** con datos |
