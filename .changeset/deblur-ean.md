---
"@qhago/scanner": minor
---

Lector EAN-13/UPC-A para códigos desenfocados (deconvolución en la cuadrícula de módulos + programación
dinámica con dígito de control). En `decode()` balanced/thorough actúa cuando la cascada no lee ningún EAN/UPC
y como verificación cruzada de los de poca confianza; en la cámara, como un paso más del escalado (una línea por
turno, ≤ 30 % del tiempo, confirmado en 2 frames). Fotos públicas: recall 76,6 → 80,2 % y desenfocadas
11,8 → 53,9 %, sin lecturas falsas nuevas.
