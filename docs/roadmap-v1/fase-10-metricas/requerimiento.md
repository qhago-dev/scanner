# Fase 10 — Métricas fiables y mejoras medibles

> Revisión v3 (2026-10-12) tras dos revisiones independientes (ver `REVISION.md`).

## Objetivo

Que cada mejora del motor se apruebe con **evidencia que generalice** (no ajustada a 4 productos ni al split
`test`) y atacar los dos puntos débiles medidos tras la fase 9: el **desenfoque** (con localización por IA y
EAN-8) y la **latencia de cola** (p95 205 → 367 ms en `public/test`).

## Evidencia de partida (auditoría 2026-10-12)

| Hallazgo | Medida | Consecuencia |
|---|---|---|
| `device` tiene los mismos 4 productos en dev y test (split por sesión) | 4 productos en total | El IC "por objeto" no es interpretable; "test nunca usado para ajustar" no se cumple a nivel de producto |
| `public/test` ya decidió 3 cambios, a nivel de muestra (conflictos, verify, deblur) | `test-runs.md`, `baseline.md` | No existe un conjunto `public` ciego; solo la captura nueva puede serlo |
| `public` dev (765) < test (1840) | split `sha1 % 10 < 3` | Se ajusta con poca muestra |
| Muenster (`research-only`) = 39 % de `public/test` | 723 / 1840 | La cifra global no es publicable tal cual (ADR-09) |
| Desenfoque real: 27 objetos en todo `public` | dev 11 / test 11 / holdout 5 (ArTe-Lab Dataset2) | Con n de objetos tan bajo, ninguna mejora de defocus se puede aprobar con IC |
| EAN-8 real: 88 objetos, todos `normal`; qhago ya lee 95-100 % | kaist-e8 | No hay forma de medir EAN-8 desenfocado |
| Sin negativas reales en `public` | "FP en negativas: —" | La lectura falsa con checksum válido solo se mide en `device` |
| Solo EAN en datos reales | QR y Code 128 solo sintéticos | El caso de uso de fase 9 (QR de pago, Code 128) no tiene evidencia real |
| p95/p99 suben con cada mejora | p95 205 → 327 → 367 ms; p99 492 → 682 ms | Nada lo detecta: no hay presupuesto de latencia |
| Vídeo: no se mide el coste por frame | `runners/video.ts` da ttfr y descartados | El criterio 4 de fase 9 (≤ 150 ms por frame en el teléfono) no tiene métrica |
| Cajas IA no alimentan al lector deblur | tarea pendiente de M4 | La IA localiza 13/14 no leídas, pero defocus con IA sigue en 57,9 % |
| `device-eval`/`device-cam` usan `codes[0]` y quitan ceros | `norm()` | No sirven para QR/Code 128 ni multi-código |

## Alcance

### A · Benchmark y datos

1. **Tres splits** en `public` (`dev` / `test` / `holdout`) por objeto. `test` y `holdout` son **semi-ciegos**
   (salen del `test` antiguo, ya observado a nivel de muestra): sirven de control de regresión, no de estimación
   limpia. El estimador limpio será la captura `device` v2.
2. **Licencias**: fila "publicable" (sin `research-only`) y `--exclude-license`.
3. **Negativas derivadas** de `public` (recortes sin código), solo como **control de regresión de qhago**
   (sesgadas a favor de zxing por construcción: no se comparan motores con ellas).
4. **Desenfoque derivado** (`public-blur`): fotos reales de `public` con desenfoque calibrado en módulos
   (gaussiano σ 0,6 / 0,9 / 1,2; disco y movimiento lineal equivalentes a σ 0,9), ruido y JPEG; EAN-13 y EAN-8.
   Complemento sintético-derivado: sirve para aprobar mejoras (criterios B), **no** para gates G2/G3/G5. Sesgo
   declarado: el gaussiano coincide con el modelo del lector deblur; por eso se exigen también las variantes no
   gaussianas y el desenfoque real.
5. **`device` v2**: veredictos multi-formato y multi-código, asignación explícita producto → split, herramientas
   `device-eval`/`device-cam` compatibles, reporte de cobertura y protocolo de captura.
6. **Estadística**: columna de objetos y MDE (informativos), comparación **por objeto** (objetos ganados/perdidos
   y test de signos exacto), cotas superiores para tasas con 0 eventos. La regla de gate del README (n ≥ 60) no cambia.
7. **Latencia**: coste por frame en vídeo, % de frames > 150 ms (con `slowdown`), presupuestos por hardware y
   comprobador.
8. **Registro** de toda ejecución sobre `test`/`holdout` en todos los runners.

### B · Mejoras del motor

9. **Cajas IA → deblur** en `decode()` y en la sesión de cámara (B8).
10. **deblur EAN-8 en `decode()`** (B10), **condicionado** a que la línea base muestre la brecha (ver criterios).
    La cámara (sesión) queda fuera en esta fase: su defensa exigiría ≥ 3 frames con perfiles independientes.
11. **Latencia de cola de `decode()`** (B7), al final de B, con umbrales fijados tras la línea base.

## Fuera de alcance

- Capturar fotos/clips (lo hace el autor con el protocolo de A5; ver `docs/release/acciones-externas.md`).
- **M7** (promediado de perfiles entre frames): no hay datos que lo midan (la cámara simulada repite una foto
  fija y el vídeo sintético no tiene ruido real) y su riesgo de falsos exige confirmación con perfiles
  independientes. Se retoma cuando existan clips reales del autor.
- Reentrenar el detector (G5), M9, M10, M12.
- Cambios de API: ninguno nuevo. `timeBudgetMs` amplía su semántica documentada (también acota el deblur en
  JS); va con changeset.

## Criterios de aceptación

### Infraestructura (A)

- [ ] `manifest.ts`/esquema admiten `split: "holdout"`; manifests antiguos cargan igual.
- [ ] `cli.ts`, `runners/video.ts`, `device-eval.ts` y `device-cam.ts` exigen `--reason` en `test` y
      `--reason` + `--holdout-ok` en `holdout`, y registran en `results/test-runs.md` / `holdout-runs.md`
      (helper común `bench/guard.ts`, con test).
- [ ] Reportes con fila "publicable" cuando hay `research-only`; `--exclude-license` filtra.
- [ ] Negativas derivadas: se mide cuántas salen; objetivo ≥ 200 en `dev`. Ninguna leída por zxing-cpp
      (opciones por defecto); revisión visual de 30 al azar sin barras visibles (registrada en `SOURCES.md`).
- [ ] `public-blur`: ≥ 300 objetos EAN-13 en `dev`, con tipo y σ nominal por muestra en el manifest. EAN-8: se
      informa el número de objetos; si es < 20, la decisión de B10 se aplaza (no se implementa en esta fase).
- [ ] `device` v2: v1 y v2 de veredictos; `splits.json` producto → split (los 4 actuales en `dev`); una foto
      con productos de splits distintos se excluye con aviso; `device/test` queda sin positivas hasta la captura (solo negativas).
- [ ] `coverage.ts --strict` falla hoy y lo explica; no imprime textos de códigos.
- [ ] Reportes: `objetos` (solo con código) y "MDE de esta comparación"; tabla por objeto
      (ganados/perdidos/test de signos p); FP en negativas con cota superior al 95 %.
- [ ] Vídeo: frame p50/p95/máx (ms × slowdown), % frames > 150 ms, falsas con cota por 1000 frames; JSON con
      agregados y `slowdown`.
- [ ] `budget.ts` sobre JSON de imagen y de vídeo; `budgets.json` con mediana de 3 ejecuciones y tolerancia
      del 10 %; tests de `metrics`, `guard` y `budget` en verde.

### Mejoras (B), medidas sobre `dev`

Una mejora se aprueba si cumple **todos**:

1. **Mejora medida**: cada objeto se resume en gana / pierde / empata (neto de sus muestras). En al menos un
   conjunto objetivo (abajo): ≥ 8 objetos discordantes, ganados > perdidos y test de signos exacto p < 0,05
   (o +≥ 3 lecturas en `device/dev` sin pérdidas); y en **ningún** conjunto objetivo ni en `defocus` real de
   `public/dev` ni en `device/dev`, perdidos > ganados con p < 0,05.
2. **Cero lecturas falsas nuevas**, foto a foto contra la línea base, en: `public/dev`, negativas derivadas
   `dev`, `public-blur/dev`, `device/dev`, muestras de zxing-cpp (snapshot). Para B8 también con `qhago+ai`.
3. **Sin regresión**: `public/dev` recall ≥ −0,5 pp; `synthetic-video/dev` ≥ −1 vídeo; tests verdes.
4. **Latencia**: p95 y p99 de `public/dev` y `public-blur/dev` ≤ línea base **del mismo motor** × 1,10 (mediana de
   3 ejecuciones);
   en vídeo ×5, % frames > 150 ms ≤ línea base + 2 pp.

El p del test de signos es descriptivo (varios conjuntos objetivo); la protección frente a falsos positivos de la
regla es el requisito de "ningún conjunto con pérdidas significativas" y los criterios 2-4.

Conjunto objetivo y condiciones específicas:

| Mejora | Conjunto objetivo | Condición extra |
|---|---|---|
| B8 | `public-blur/dev` (todas las variantes) con `qhago+ai` | Como mucho 2 regiones IA por imagen; total ≤ 3 regiones. La parte de sesión se aprueba con `device-cam` dev (lecturas ≥ base, falsas iguales); si no, se deja desactivada |
| B10 | EAN-8 de `public-blur/dev` | Solo `decode()`. Se implementa si en F10.L hay ≥ 20 objetos EAN-8 y el recall EAN-8 de `public-blur` es ≥ 10 pp menor que el de EAN-13 al mismo σ (también en las variantes no gaussianas). Cero EAN-8 leídos en las imágenes EAN-13 de `public/dev` + `public-blur/dev` |
| B7 | p95/p99 de `public/dev` y `public-blur/dev` | Objetivo fijado tras F10.L: −30 % en p99 sin perder recall (criterio 3) |

### Cierre

- [ ] Una ejecución sobre `public/test` con `--reason "Cierre F10"` (control de regresión semi-ciego). `holdout`
      no se toca. `device/test` solo si el autor ya capturó productos nuevos.
