---
"@qhago/scanner": patch
---

Cámara: un EAN/UPC con confianza < 1 (≤ 3 líneas de barrido de acuerdo) se confirma en 2 frames. En fotos reales
de un envase arrugado la pasada normal devolvía EAN falsos con checksum válido, todos con confianza 0,5-0,75.
