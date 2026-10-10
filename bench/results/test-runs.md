# Ejecuciones sobre el split test

| Fecha | Commit | Dataset | Motores | Motivo |
|---|---|---|---|---|
| 2026-10-10 | a65c643 | synthetic | qhago,zxing-wasm,zxing-js,quagga2 | Baseline F1.9 sobre dataset sintético (no real) |
| 2026-10-10 | 695c8e0 | synthetic | qhago,qhago+ai | G5 (sintético): detector-v1 int8 |
| 2026-10-10 | fba9312 | public | qhago,qhago+ai,zxing-wasm,zxing-js,quagga2 | Primer benchmark con fotos reales públicas (ArTe-Lab, KAIST, Muenster); G1/G2/G5 orientativos |
| 2026-10-10 | 2e985a6 (+ cambio) | synthetic-video | qhago | Barrido en rebanadas (latencia Android) vs barrido completo: 73,7 % ambos |
