# Fase 10 — Diseño

## A1 · Tres splits en `public`

- `import.py`: `b = sha1(valor) % 10` → `b < 5` dev, `5 ≤ b < 8` test, `b ≥ 8` holdout
  (1288 / 818 / 499 imágenes; 1061 / 663 / 425 objetos). Mismo producto → mismo split.
- Composición respecto al split anterior: dev = 765 del dev antiguo + 523 del test antiguo; test y holdout =
  100 % del test antiguo. Por eso test/holdout son **semi-ciegos** (control de regresión) y el dev nuevo
  contiene imágenes que ya decidieron cambios. `baseline.md` y `SOURCES.md` lo dicen.
- Esquema: `split ∈ {dev, test, holdout}`.

## A8 · Guarda y registro (`bench/guard.ts`)

```ts
guardSplit({ split, reason, holdoutOk, runner, dataset, engines, out }): void
```

- `test` sin `reason` → exit 2. `holdout` sin `reason` o sin `holdoutOk` → exit 2 (fricción deliberada, no seguridad).
- Registra una fila en `results/test-runs.md` o `results/holdout-runs.md` (fecha, commit, runner, dataset, motores, motivo).
- Lo usan `cli.ts`, `runners/video.ts`, `device-eval.ts`, `runners/device-cam.ts`.

## A2 · Licencias

- `report.ts`: si alguna muestra es `research-only`, la tabla global añade "`<motor>` (publicable)" sin ellas.
  En `holdout` la parte publicable es 289 de 499.
- `cli.ts --exclude-license research-only[,…]`.

## A3 · Negativas derivadas (`bench/dataset/public/derive.py negatives`)

1. Localización con **zxing-cpp Python** fijado a `zxing-cpp==3.1.1` (también en `bench.yml`), opciones por defecto
   (`try_rotate`, `try_downscale`, `try_invert`; la API 3.x no tiene `try_harder`). Muestra del 10 %: localiza el 71 %.
   Sin localización → la imagen no genera negativas.
2. Zona de exclusión 1D: el cuadrilátero de zxing-cpp en 1D puede ser casi una línea, así que se construye
   desde el **largo** `L` del símbolo: rectángulo orientado de `1,5·L` × `1,2·L` centrado en el símbolo
   (cubre barras, zona de silencio y dígitos).
3. Recortes en rejilla con lado `max(160, 0,4 · lado corto)`, sin intersección con la zona de exclusión; como
   mucho 2 por imagen, los de mayor varianza local.
4. Verificación: zxing-cpp no lee nada en el recorte.
5. Manifest aparte `public/manifest-neg.jsonl` (dataset `public-neg`): `codes: []`, `complete: true`,
   escenario `negativa-recorte`, `object` y `split` del original, misma licencia.
6. Uso: control de regresión de qhago (y qhago+ai). El reporte marca la comparación entre motores en
   este dataset como "no comparable" (filtrado por un lector de la familia zxing).

Primero se mide el rendimiento (cuántas salen); el criterio es ≥ 200 en dev o, si no, se documenta el número
real y se complementa con las 67 negativas de `device/dev`.

## A4 · Desenfoque derivado (`derive.py blur` → dataset `public-blur`)

1. Del mismo paso de localización: ancho de módulo `w = L / 95` (EAN-13) o `L / 67` (EAN-8), con `L` el largo del
   cuadrilátero de zxing-cpp. Se comprueba en 10 ejemplos que `L` abarca solo las barras (sin zona de silencio);
   si no, se corrige el divisor. Mediana medida: `w` ≈ 5,7 px.
2. Por imagen de `public` escenario `normal`, 5 versiones: gaussiana σ ∈ {0,6; 0,9; 1,2} módulos (`σ·w` px);
   disco de radio `2·0,9·w` px; movimiento lineal de longitud `√12·0,9·w` px en dirección aleatoria (misma
   varianza que la gaussiana σ 0,9). Después ruido gaussiano σ = 2 niveles y JPEG calidad 85. Semilla fija por id.
   El σ registrado es el **nominal** (el desenfoque propio de la foto se suma).
3. Se descartan las imágenes con `w < 1,5 px` (el desenfoque haría el código ilegible a cualquier lector).
4. Manifest `public/manifest-blur.jsonl`: escenarios `blur-0.6`, `blur-0.9`, `blur-1.2`, `disk-0.9`, `motion-0.9`; `object` y `split`
   del original; licencia del original; `source` con sufijo `-blur`.
5. Sesgos conocidos (en `SOURCES.md`): solo imágenes que zxing-cpp localiza en nítido; el gaussiano coincide con el
   modelo del lector deblur (por eso las variantes disco/movimiento y el control con `defocus` real y `device`).
   Es un complemento sintético-derivado: aprueba mejoras (B), nunca gates.
6. Rendimiento: se informa por formato. EAN-8 en dev parte de 42 objetos; si quedan < 20, B10 se aplaza.

Imágenes y PNG derivados en `public/derived/` (gitignored, reproducibles).

## A5 · `device` v2

`veredictos.json` v2 (`"_version": 2`):

```json
{ "_version": 2,
  "_productos": { "leche": { "format": "ean_13", "text": "…" }, "yape": { "format": "qr_code", "text": "…" } },
  "0001": "S:leche", "0002": "M:yape", "0003": "N", "0004": "S:leche+yape" }
```

- v1 (`_productos` con texto) → `ean_13`.
- `bench/dataset/device/splits.json` (privado, gitignored como el manifest): `{ "<texto del código>": "dev" | "test" }`.
  Los 4 productos actuales → `dev` (por eso `device/test` queda sin positivas hasta la captura). Un producto nuevo sin entrada → aviso y se excluye (no hay asignación
  implícita por hash: la cobertura se estratifica a mano). Negativas: split de su sesión en `splits.json`
  (`"session:<id>": "test"`), por defecto `dev`.
- Foto con productos de splits distintos → excluida con aviso. `device` no tiene `holdout`.
- Escenario = clase (`legible`/`dudosa`/`sin-codigo`); objeto = producto; las negativas no cuentan como
  objetos para la suficiencia de recall.
- `device-eval.ts` y `device-cam.ts`: comparan con `equivalent()` de `metrics.ts` (sin quitar ceros salvo
  GTIN), todos los códigos esperados, guarda de split, y `--json` con detalle foto a foto.

`bench/coverage.ts --dataset device|public [--strict]` frente a `bench/dataset/targets.json`
(objetos con código por split dev y test: EAN-13/UPC 60, EAN-8 15, QR 20, Code 128 15; negativas 100;
muestras por escenario con gate 60). Solo imprime conteos.

Protocolo `docs/guias/captura-device.md`: lista de productos repartidos 50/50 entre dev/test en `splits.json`
**antes** de capturar; 3-5 fotos por producto (distancia, ángulo, luz); envases rígidos, flexibles y curvos;
QR en pantalla y papel (sin QR de pago con datos personales reales: se usan QR de prueba); negativas.

## A6 · Estadística

- `pairedBootstrap` añade `se` (desviación típica de la distribución bootstrap) y `mde = 2,8 · se`, etiquetado
  "MDE de esta comparación" (no es la potencia para 5 pp de F1.9: con motores casi idénticos el `se` es pequeño).
- `objects` cuenta solo objetos con al menos una muestra con código.
- `verdict()` no cambia (regla del README: "sin gate" por escenario con n < 60). Se añade un aviso
  "pocos objetos (< 30): IC poco fiable" en la columna de objetos.
- `objectCounts(a, b, metric)`: por objeto, neto de sus muestras (Σ diferencias > 0 gana, < 0 pierde, = 0 empata);
  test de signos exacto bilateral sobre los objetos discordantes. Las muestras del mismo objeto (variantes de una foto,
  varias fotos de un producto, 2 negativas de una imagen) no cuentan como pares independientes.
- `upper95(k, n)`: cota superior Clopper-Pearson de una tasa (0/300 → 1,0 %). Para FP en negativas y falsas/1000 frames.
- `bench/diff.ts <base.json> <nuevo.json>`: falsas nuevas foto a foto (criterio 2 de B) y conteo por objeto con test
  de signos (criterio 1). Requiere que los JSON de `cli.ts` incluyan el detalle por muestra (se añade).

## A7 · Latencia

Vídeo (`runners/video.ts`): por frame procesado se guarda `ms × slowdown`. Tabla y JSON:

```json
{ "meta": { "slowdown": 5, … }, "engines": { "qhago": { "videos": 53, "readPct": …, "ttfrP50": …,
  "frameP50": …, "frameP95": …, "frameMax": …, "framesOver150Pct": …, "falseReads": 0,
  "falsePer1000Upper": … } }, "detail": … }
```

`bench/budgets.json`:

```json
{ "dev-local": {
    "public/dev": { "qhago": { "p95": …, "p99": … } },
    "synthetic-video/dev@x5": { "qhago": { "framesOver150Pct": … } } } }
```

- Valores = mediana de 3 ejecuciones de la línea base × 1,10, **por motor**. F10.6 entrega la herramienta con
  valores provisionales; F10.L los fija.
- `bench/budget.ts <reporte.json> --hw dev-local` → OK/excedido, exit 1 si se excede; sin entrada → informa.
- CI nocturno: hoy solo corre zxing y sintético (sin `public` ni vídeo: no hay ffmpeg ni descarga en ese job);
  el check es local hasta que se añadan. Se documenta.

## B8 · Cajas IA → deblur

- `decodeWithPlugins` devuelve `proposals` (todas las de los plugins ejecutados). Nota: el plugin solo se ejecuta
  si la cascada no leyó nada (o `when: "always"`); si leyó un QR no hay propuestas.
- `deblur/locate.ts`: `quadToRegions(quad)` → regiones `Region1D`:
  - orientación por el tensor de estructura dentro de la caja (reutiliza el cálculo de `locate1D` sobre un
    sub-raster con `stride` del original y reproyecta `cx/cy`); si la coherencia del tensor es < 0,5, ambos ejes
    de la caja (2 regiones). Tests: caja casi cuadrada y rotada 30°.
- `deblurFallback(raster, results, options, extra?)`: primero hasta **2** regiones IA (mayor `score`); con regiones
  IA el tensor aporta 1 (sin IA, 2 como hoy); se descartan duplicadas (centros a < 0,5 × ancho). Total ≤ 3.
- Sesión: si un plugin propone sin lectura, sus regiones (≤ 2) se **unen** a `deblurRegions` hasta la próxima
  relocalización; la relocalización por tensor sigue ocurriendo cada 600 ms.
- Mismos umbrales de aceptación; en vídeo, lectura `weak` (2 frames).

## B10 · deblur EAN-8 (condicionado, solo `decode()`)

Se implementa solo si F10.L muestra la brecha (ver requerimiento). La sesión de cámara no cambia en esta fase
(`wantsEan()` y `deblurStep` siguen solo con EAN-13/UPC-A): con 1 línea por paso no se puede exigir 3 líneas.

- `ean.ts` se reorganiza en una `Symbology` con sus constantes (`modules` 95/67, dígitos, guardas, `Q`, `NM`,
  `NS`) y sus búferes; `solver` se cachea por (simbología, σ). EAN-13 debe dar resultados idénticos (test
  de no regresión con los fixtures de deblur y el snapshot).
- EAN-8: 4 dígitos L + `01010` + 4 dígitos R; DP de 8 dígitos con checksum (pesos 3,1,3,1,…).
  Sin paridad, el `margin` es la diferencia con el **segundo mejor número válido** (cualquiera) y el umbral se
  ajusta en `public-blur/dev` para 0 falsas en EAN-13 → EAN-8.
- Defensas extra: `minVotes = 3` líneas para EAN-8; si en la misma región EAN-13 acepta, no se prueba EAN-8.
- Coste: EAN-8 solo se evalúa en tramos cuyo número de picos y longitud encajan con 67 módulos (no en todos los
  tramos EAN-13), para no duplicar el trabajo del fallback (criterio de latencia B4).
- `span.ts`: tramos por simbología (EAN-8: `L ≥ 67·1,2`, picos 18-30); el solape con EAN-13 se resuelve por el
  ajuste del modelo completo, no por los picos.
- `toResult` recibe la simbología: `format` `ean_8`, `symbologyIdentifier` `]E4`; `readBlurredEan` devuelve como
  mucho un EAN por región (13 u 8); `normalizeUpc` deja EAN-8 intacto (test).
- `deblurFallback` también se activa si se pidió `ean_8`.
- Esfuerzo realista: 2,5 d.

## B7 · Latencia de cola de `decode()` (al final de B)

1. **Perfilado** (`bench/profile-decode.ts`): por muestra de `public/dev` y `public-blur/dev`, tiempo de
   `readRaster` con y sin `noVerify` (aísla `verifyHarder`), `deblurCrossCheck` y `deblurFallback` (exportados).
2. Candidatas según el perfilado:
   - **Límite por trabajo** en el deblur por defecto (regiones × líneas × tramos), no en ms: el resultado no
     depende de la velocidad de la máquina.
   - **Corte temprano**: región con `score` bajo → sin deblur (umbral con 0 pérdidas en dev).
   - **`timeBudgetMs`** (opción existente; el motor WASM corta entre pasadas tras la primera): si el usuario lo
     fija, el deblur en JS respeta el tiempo restante. Reloj inyectable para los tests. Semántica ampliada en el
     JSDoc + changeset.
   - **`verifyHarder`** acotado si el perfilado lo muestra en la cola.
3. Cada candidata se mide sola con los criterios de B.

## B7.P · Pirámide para fotos grandes (ampliación v4, tras F10.L)

Evidencia (`profile-decode.ts`, `public/dev`): la cola (≥ p95) es la cascada del motor (60 %) sobre fotos > 4 MP
(47 de 65). De esas 65: 44 se leen en la 2.ª pasada (`harder`) y son lentas solo por el tamaño (base de hasta
2560 px); 17 no se leen tras las 4 pasadas; 2 se leen en `clahe`.

Diseño (solo `decode()`, `balanced`, raster con lado mayor > 1600 px; `fast`, `thorough`, `region` y la cámara no cambian):

1. **Etapa 1**: `readRaster` con `maxSide` = 1280 (la cascada `balanced` completa sobre la copia reducida; el motor
   ya reescala y devuelve coordenadas en el raster original).
2. Si la etapa 1 devuelve resultados → se usan (pasan por `verifyHarder`, conflictos y deblur como siempre).
3. Si no → **etapa 2**: `fast` + `harder` sobre la base de 2560 px (sin `inverted`/`clahe`, que ya se probaron en la
   etapa 1), con `returnErrors` igual que la llamada original; candidatos de ambas etapas se unen.
4. `maxSide` es un campo interno de `EngineCallOptions` (no público). `timeBudgetMs` del usuario se respeta en las dos
   etapas (el tiempo de la etapa 1 se descuenta).

Coste esperado: lecturas en `harder` ≈ ¼; fallos: 4 pasadas de 2560 → 4 de 1280 + 2 de 2560 (≈ −40 %).
Riesgo: códigos pequeños (< 1,5 px/módulo tras reducir) que hoy lee `harder` a 2560: la etapa 2 los cubre. Las
lecturas solo con `inverted`/`clahe` a 2560 se pierden si a 1280 no salen (2 en la cola de `public/dev`): se mide.

Criterios: los de B (requerimiento) más el objetivo de B7 (p99 −30 % en `public/dev` y `public-blur/dev`).

**Revisión (2026-10-12): NO APROBADO → no se implementa.** Bloqueantes: (1) `decode()` es multi-código por defecto
(`maxSymbols` 255) y una etapa 1 que corta con el primer resultado perdería en silencio códigos pequeños de la misma
foto; evitarlo exige correr siempre la etapa 2, lo que anula la ganancia; (2) la etapa 2 "fast + harder sin
inverted" no se puede expresar con las opciones del motor (`tryInvert` controla ambas cosas): requiere una opción
nueva en C++ y recompilar el WASM. Además, la estimación revisada (≈ −21 % de p99, la cascada es el 60 % de la cola y
las 17 fotos no leídas siguen pagando el resto) no alcanza el objetivo.

**Cierre de B7**: objetivo no alcanzable en esta fase. La cola afecta a `decode()` con fotos > 4 MP en escritorio; la
cámara (frames ≤ 1280 px) se rige por las métricas de vídeo y está dentro de presupuesto. Se documenta en la guía de
archivos cómo acotarla (reducir a ~1600 px o `timeBudgetMs`). Las candidatas del diseño original (límite de trabajo de
deblur, `verifyHarder`) actúan sobre ≤ 40 % de la cola y tampoco lo alcanzan: no se implementan. Pendiente para una
fase posterior: pirámide en el motor C++ con pasada de completado multi-código.
