---
"@qhago/scanner": patch
---

Las lecturas de plugins (detector IA) pasan por la misma verificación que las de la cascada: relectura normal
de la zona y descarte de lecturas 1D que contradicen a otra. En fotos reales de Android, con IA las lecturas
falsas bajan de 8 a 3 (modo "always") sin perder lecturas; en fotos públicas (dev) 4 → 2.
