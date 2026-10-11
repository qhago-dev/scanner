---
"@qhago/scanner": patch
---

Cámara (ruta track-processor, Chrome Android): el intervalo entre frames del worker solo podía crecer
(`max(minInterval, 1,2·EMA)`), así que un frame lento aislado —carga del modelo IA, un barrido— dejaba la
cámara a < 1 fps el resto de la sesión (medido: un frame cada 5,8 s tras cargar la IA). El worker usa ahora
el mismo planificador que el hilo principal: 1,2 × mediana de los últimos 8 frames, acotado entre maxFps y 4 fps.
