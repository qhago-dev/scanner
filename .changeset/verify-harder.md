---
"@qhago/scanner": patch
---

Lecturas falsas: un EAN/UPC encontrado solo por las pasadas "harder" se relee sin "harder" en dos vistas
de su zona; si alguna da otro número, se descarta. Corrige lecturas falsas con checksum válido sobre envases
arrugados (reproducidas también en zxing-wasm upstream). Coste: p95 de `decode()` balanced 165 → 327 ms en
fotos reales públicas; recall 76,6 %.
