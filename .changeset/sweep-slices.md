---
"@qhago/scanner": patch
---

Cámara: el barrido de escalado (thorough) se reparte en rebanadas (zona × preproceso), una por frame vacío,
en lugar de ejecutar las 13 pasadas de golpe. En un Android de gama media cada frame de barrido pasaba de
~650 ms a decenas de ms, así que el motor ya no está ocupado cuando el código entra en cuadro.
