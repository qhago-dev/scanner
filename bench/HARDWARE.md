# Hardware de referencia (F1.8)

Las latencias absolutas solo se comparan dentro del mismo dispositivo. Rellenar al fijar el baseline.

| Id | Uso | Dispositivo | SO / navegador | Registrado |
|---|---|---|---|---|
| `desktop-ref` | Regresiones relativas en CI | Runner `ubuntu-latest` de GitHub Actions (anotar modelo de CPU en cada reporte) | Ubuntu, Node 22 / Bun / Playwright | automático |
| `dev-local` | Desarrollo | Intel Core i9-12900H, 32 GB, RTX 3060 Laptop | Ubuntu, Node 24, Bun 1.3 | 2026-10-10 |
| `android-mid` | Latencias absolutas, G3/G5 | _pendiente: un Galaxy A-series del año_ | Android, Chrome estable | — |
| `ios-ref` | Latencias absolutas | _pendiente: iPhone de 3-4 generaciones_ | iOS actual, Safari | — |

## Inventario para pruebas manuales (F3.9, F6.7)

| Dispositivo | Motivo | Responsable | Estado |
|---|---|---|---|
| Android con ≥ 2 cámaras traseras (×2 modelos) | Heurística de cámara principal | autor | pendiente |
| Android gama baja | Rendimiento / memoria | autor | pendiente |
| iPhone con iOS actual | Safari iOS | autor | pendiente |
| iOS 16.x en nube (BrowserStack/LambdaTest, sesión manual) | Mínimo soportado Safari 16.4 | autor | pendiente (requiere cuenta) |
| Desktop: Chrome, Edge, Firefox, Firefox ESR, Safari macOS | Matriz de escritorio | autor | pendiente |

## Medir en dispositivo real

1. Servir la demo por HTTPS (`bun run --filter qhago-demo dev -- --host` + túnel, o el despliegue de F3.9).
2. Abrir `/bench.html` en el dispositivo: corre el set elegido y sube el JSON de resultados.
