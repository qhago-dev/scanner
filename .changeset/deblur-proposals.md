---
"@qhago/scanner": patch
---

Lector EAN para códigos desenfocados: no intenta leer por debajo de 1,5 px por módulo (en una miniatura de
140×38 px daba otro EAN con dígito de control válido). Nueva opción experimental
`advanced.deblurProposals` (default `false`): las cajas propuestas por plugins (detector de `@qhago/ai`) también
alimentan a ese lector en `decode()`, con 3 líneas de acuerdo y ninguna discrepante. En fotos desenfocadas
derivadas de las públicas suma lecturas (+43 objetos en 809, ninguno perdido) pero aún da 1 lectura falsa nueva en
4575 imágenes: queda desactivada hasta validarla con fotos reales del dispositivo.
