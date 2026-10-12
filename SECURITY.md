# Política de seguridad

## Versiones con soporte

| Versión | Soporte |
|---|---|
| Última `1.x` | Correcciones de seguridad |
| Pre-releases (`alpha`, `beta`, `rc`) | Solo la última de cada canal |

## Reportar una vulnerabilidad

**No abras un issue público.** Usa el reporte privado de GitHub: pestaña *Security* → *Report a vulnerability*
(private vulnerability reporting). Incluye versión, entorno (navegador/Node/Bun), pasos y, si puedes, la imagen o el
archivo que dispara el problema.

Compromiso: acuse de recibo en 3 días hábiles, evaluación inicial en 10 y publicación coordinada del arreglo con un
aviso (GHSA) y crédito a quien lo reporte, si lo desea.

## Superficie relevante

- El motor procesa imágenes no confiables dentro de WebAssembly (ZXing-C++). Se fuzzea cada noche (`packages/engine-wasm/fuzz`).
- El paquete no hace peticiones de red salvo para cargar su propio `.wasm`/worker (configurable con `configure`).
- Lecturas falsas (un código leído con un valor distinto del real) se tratan como fallos graves aunque no sean de
  seguridad: repórtalas como bug con la imagen.
