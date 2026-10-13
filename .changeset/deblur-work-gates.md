---
"@qhago/scanner": patch
---

Lector EAN para desenfoque en `decode()`: no afina tramos sin opciones (ajuste grueso < 0,7), prueba las líneas
del centro hacia fuera y abandona una región si sus 2 primeras líneas no llegan a 0,6. Mismas lecturas foto a foto
en todos los conjuntos de evaluación; p95 de `decode()` en fotos públicas 311 → 235 ms (p99 578 → 429 ms).
