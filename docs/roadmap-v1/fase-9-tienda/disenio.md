# Fase 9 — Diseño

## M6 · Conjunto `device`

- Fotos del modo depuración de la demo (`apps/demo/debug-captures/<sesión>/`, fuera de git) con
  `veredictos.json`: `S:<producto>` (debería leerse), `M:<producto>` (dudosa), `N` (sin código legible).
- `bench/dataset/device/build.py` → `bench/dataset/device/manifest.jsonl` (**gitignored**: son fotos privadas).
  `S` y `M` llevan el código esperado; `N` son negativas. Escenario = clase.
- Métricas: lecturas correctas en S y en M, falsas en todo el conjunto.

## M4 · `deblur-ean`

Módulo `packages/scanner/src/deblur/` (TS puro, sin dependencias), usado desde la cascada y la sesión.

1. **Localización** (`locate.ts`): tensor de estructura sobre el raster reducido a ≤ 480 px → componentes con
   energía y coherencia altas → orientación y extensión. Se aceptan además regiones dadas (caja IA, track sin leer).
2. **Perfiles** (`profile.ts`): líneas perpendiculares a las barras, promediadas en una banda de 5 px, 2 muestras/px.
3. **Tramo** (`span.ts`): candidatos entre zonas blancas (≥ 2 módulos) con 24-40 picos; se prueban los 4 mejores.
4. **Deconvolución** (`decon.ts`): remuestreo a 6 muestras/módulo (113 módulos con márgenes); `b̂ = P_σ·y`
   con `P_σ = (AᵀA + λI)⁻¹Aᵀ` precalculada para σ ∈ {0,25; 0,45; 0,7; 0,95; 1,2} módulos.
5. **Dígitos + DP** (`ean.ts`): distancia cuadrática a los patrones L/G/R; DP sobre los 12 dígitos con el
   estado "suma ponderada mod 10" y la paridad del primer dígito → mejor número con checksum válido y el
   segundo mejor (margen).
6. **Geometría de grueso a fino**: inicio ±1,2 módulos, ancho ±3 %, curvatura ±8 %, σ; criterio = correlación
   del modelo completo (`A·bits`) con el perfil.
7. **Aceptación**: ajuste ≥ 0,85, margen ≥ 0,8, ≥ 2 líneas de acuerdo y ninguna discrepante fuerte. En vídeo,
   además, es una lectura de escalado (`weak`): 2 frames.
8. EAN-13 y UPC-A (UPC-A = EAN-13 con 0 inicial, se normaliza con `normalizeUpc`). EAN-8 en una segunda iteración.

Integración:
- `decode()` `balanced`/`thorough`: si la cascada no devolvió EAN/UPC y se pidieron, se ejecuta M4 sobre las
  regiones localizadas.
- Cámara: rebanada del barrido (`SWEEP_SLICES`) y para los tracks sin leer; presupuesto por frame (una región,
  pocas líneas), cada línea es independiente → se reparte entre frames.
- Plugins IA: las cajas propuestas también alimentan M4.

Rendimiento objetivo: ≤ 15 ms por línea en escritorio (≈ ≤ 150 ms en el teléfono para 1 línea por frame).
