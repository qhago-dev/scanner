---
"@qhago/scanner": patch
---

Cámara: la inferencia del detector IA en vídeo se limita al 25 % del tiempo (en un Android de gama media cada
inferencia WASM tarda ~1 s y bloqueaba el worker: frames de 1-3 s). Los EAN/UPC leídos solo por pasadas de
escalado (barrido, ROI de un track, plugins) se confirman en 2 frames; los de la pasada normal, en 1.
