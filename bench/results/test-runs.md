# Ejecuciones sobre el split test

| Fecha | Commit | Dataset | Motores | Motivo | Runner |
|---|---|---|---|---|---|
| 2026-10-11 | 5e25efc | public | qhago,qhago+ai | fase 9 M4: lector deblur-EAN en decode() (fallback + verificación cruzada) | cli |
| 2026-10-11 | 5e25efc (+ cambio) | public | qhago,qhago+ai | Fase 9 M4: lector deblur-EAN (recall 76,6 → 80,2 %; defocus 11,8 → 53,9 %; mismas falsas foto a foto) | cli |
| 2026-10-12 | f686758 | public | qhago,qhago+ai,zxing-wasm | Cierre F10 (control de regresión semi-ciego) | cli |
| 2026-10-12 | f686758 | public-neg | qhago,qhago+ai,zxing-wasm | Cierre F10 (control de regresión semi-ciego) | cli |
| 2026-10-12 | f686758 | public-blur | qhago,qhago+ai,zxing-wasm | Cierre F10 (control de regresión semi-ciego) | cli |
| 2026-10-13 | ad12c4c | public | qhago,zxing-js,quagga2 | Comparativa final con zxing-js y Quagga2 (sin cambios de código) | cli |
| 2026-10-13 | ad12c4c | public-neg | qhago,zxing-js,quagga2 | Comparativa final con zxing-js y Quagga2 (sin cambios de código) | cli |
| 2026-10-13 | 68b37c2 | public | qhago,qhago+ai,zxing-wasm,zxing-js,quagga2 | Comparativa tras arreglos de latencia (redimensionado separable y cortes del lector deblur) | cli |
