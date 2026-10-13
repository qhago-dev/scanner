---
"@qhago/scanner": patch
---

Motor: el redimensionado bicúbico (fotos de más de 2560 px y pasadas multiescala) es separable y con pesos
precalculados. Mismos resultados; una foto de 6,6 MP pasa de ~350 a ~90 ms en la primera pasada y en las fotos
públicas de `dev` el p95 de `decode()` baja de 499 a 311 ms (p99 931 → 578 ms).
