# Rendimiento, ROI y multi-código

## Estrategia

| `strategy` | Uso |
|---|---|
| `fast` | Vídeo y capturas nítidas: una pasada |
| `balanced` (defecto) | Fotos de móvil: añade pasadas "harder", invertida y contraste local; lector EAN para desenfoque |
| `thorough` | Fotos difíciles: además nitidez, multiescala y recortes |

En la cámara, la estrategia base es la del frame; las pasadas caras se reparten entre frames (escalado por track,
barrido rotativo en rebanadas y lector de desenfoque) con un tope de tiempo para no bloquear la cámara.

## ROI

`roi` (cámara, normalizada 0..1) o `region` (`decode()`, en píxeles) limitan la zona: más rápido y menos lecturas
falsas. En la cámara, combina un ROI con una guía visual (como la línea láser de `<qhago-scanner>`).

## Multi-código

`decode()` devuelve todos los códigos de la imagen (`maxSymbols`, por defecto sin límite práctico) y la cámara
sigue varios a la vez (`maxCodes`). Cada resultado trae `cornerPoints`, `boundingBox` y `orientation`.

## Latencia de referencia

Ver [Benchmark](/benchmark): en fotos públicas `balanced` tiene p50 ≈ 20 ms y una cola (p95/p99) de ~0,5-1 s en fotos
de más de 4 MP en escritorio. Si importa la latencia de esas fotos, redúcelas a ~1600 px antes de `decode()` o usa
`timeBudgetMs`.
