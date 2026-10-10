# Fase 1 — Dataset y benchmark real

**Esfuerzo**: 10-13 días (incluye 5-7 persona-días de captura y etiquetado) · **Prioridad**: Alta (define los gates G2, G3, G5) · **Depende de**: F0

## Problema

No hay ninguna medición real. El benchmark actual simula los resultados de ScanAI y el dataset es solo sintético, que sobreestima a cualquier motor y no representa cámaras reales (ruido de sensor, compresión, reflejos, enfoque automático).

## Requerimiento

Un harness reproducible que compare ScanAI contra competidores sobre **imágenes y vídeos reales** etiquetados, y que produzca un reporte versionado.

### Debe

1. **Dataset real** con al menos 1 500 imágenes y 250 vídeos cortos (3-10 s), etiquetados con: texto esperado, formato, escenario(s), dispositivo, resolución, licencia de la fuente. Se cumple ADR-12 (privacidad).
   - **Anotación completa**: cada muestra marca `complete: true` si **todos** los códigos visibles están etiquetados. Solo en esas muestras una lectura extra no etiquetada cuenta como falsa.
   - **Mínimos por formato**: ≥ 80 muestras de cada formato principal (EAN-13, Code128, QR, DataMatrix, PDF417) y ≥ 30 de cada uno de los demás (EAN-8, UPC-A, UPC-E, Code39, Code93, Codabar, ITF, Aztec).
   - **Muestras negativas**: ≥ 150 imágenes y ≥ 10 vídeos **sin** códigos (texto impreso, rejas, teclados, telas a rayas) para medir falsos positivos.
   - **Etiquetado sin sesgo**: el texto esperado se valida con al menos 2 motores distintos o a mano; nunca solo con un competidor del benchmark.
2. **Escenarios** (una imagen puede tener varios). Para que cada escenario tenga gate (≥ 60 muestras en `test`, README) se necesitan **≥ 200 imágenes por escenario** con el split 70/30. Como una imagen puede pertenecer a varios escenarios, 1 500 imágenes alcanzan si se planifica la captura; si algún escenario no llega a 200, se informa sin gate y queda listado en el reporte:
   `normal`, `low_light`, `motion_blur`, `defocus`, `perspective`, `curved` (latas/botellas), `small`, `multi`, `glare`, `screen` (código en pantalla), `damaged`, `inverted`, `dense_2d`.
3. **Dataset sintético** (el generador actual, corregido) solo como complemento y separado en el reporte.
4. **Competidores**: Quagga2 (`@ericblade/quagga2`), `zxing-wasm`, `@zxing/library` (ZXing-JS), `BarcodeDetector` nativo. `BarcodeDetector` no existe en Chrome para Linux (runner de CI), así que se mide en una corrida manual o self-hosted en macOS y Android, cuyo resultado se versiona con fecha; el CI nocturno compara solo contra los otros tres.
5. **Hardware de referencia** (lo citan los gates y presupuestos de F2, F3, F5, F6), fijado y documentado en `bench/HARDWARE.md`:
   - `desktop-ref`: runner de CI estándar (`ubuntu-latest`, se registra modelo de CPU) — para regresiones relativas.
   - `android-mid`: un modelo concreto de gama media (p. ej. Galaxy A-series del año) — para latencias absolutas.
   - `ios-ref`: un iPhone de hace 3-4 generaciones.
   Las latencias absolutas solo se comparan dentro del mismo dispositivo.
6. **Inventario de dispositivos para pruebas manuales** (lo usan F3.9 y F6.7), en `bench/HARDWARE.md`: ≥ 2 Android con varias cámaras traseras, 1 Android de gama baja, 1 iPhone con iOS actual, acceso a dispositivos de nube con iOS 16.x (BrowserStack/LambdaTest, sesión manual), y los navegadores de escritorio. Presupuesto estimado y responsable.
7. **Métricas**:
   - Tasa de lectura (recall) por escenario y formato, a dos niveles: **por muestra** (todos los códigos esperados leídos) y **por código**.
   - **Tasa de lectura falsa** — KPI principal: `lecturas con texto incorrecto + lecturas extra en muestras complete + lecturas en negativas` / lecturas totales. Se reporta también por formato.
   - Latencia por imagen p50/p95/p99 (mismo hardware, mismo runtime).
   - Comparaciones pareadas con bootstrap por objeto físico (definiciones del README).
   - Vídeo: time-to-first-correct-read p50/p95 y % de vídeos leídos.
   - Memoria pico y tamaño de bundle descargado.
8. **Ejecución** en navegador real (Playwright: Chromium, Firefox, WebKit) y en Node/Bun para imágenes. El CI accede al dataset privado con una credencial de solo lectura (secreto del repo); los PRs de forks no corren el bench.
9. **Reporte** `bench/results/<fecha>-<commit>.json` + `.md` con tablas, intervalos de confianza (bootstrap 95 %) y entorno.

### No debe

- Mezclar resultados sintéticos con reales en la misma cifra.
- Ajustar parámetros por motor contra el set de test (hay split `dev` / `test`). El CI nocturno corre **solo `dev`**; `test` solo se corre para reportes de gate (G2, G3, G5) y RCs, y cada ejecución queda registrada en `bench/results/test-runs.md` (fecha, commit, motivo).

## Criterios de aceptación (gate G1)

- [ ] ≥ 1 500 imágenes y ≥ 250 vídeos reales etiquetados, con licencia registrada por fuente, mínimos por formato cumplidos, + muestras negativas.
- [ ] ≥ 70 % de las muestras con `complete: true`.
- [ ] `bench/HARDWARE.md` con los 3 dispositivos de referencia y el inventario de pruebas manuales.
- [ ] Cálculo de potencia (F1.9) que confirma que los tamaños de `test` detectan 5 pp; si no, se amplía el dataset.
- [ ] Revisión de privacidad (ADR-12) registrada por lote.
- [ ] Split `dev`/`test` fijo (imágenes 70/30, vídeos 50/50 para tener ≥ 125 vídeos de test) estratificado por escenario y agrupado por objeto físico (todas las fotos/vídeos de un mismo objeto en el mismo split). F5 subdivide `dev` en `dev-train`/`dev-val` con la misma regla.
- [ ] `bun run bench -- --engines all --split dev` corre en CI nocturno y genera reporte; `--split test` exige `--reason` y registra la ejecución.
- [ ] Baseline de los 4 competidores publicado en `bench/results/baseline.md`.
- [ ] Revisión manual de 100 etiquetas al azar: ≥ 99 % correctas.
