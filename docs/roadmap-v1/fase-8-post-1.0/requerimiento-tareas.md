# Fase 8 — Post-1.0 (backlog priorizado)

No bloquea la publicación. Cada ítem se convierte en una fase SDD propia (requerimiento / diseño / tareas) cuando se priorice.

| Prioridad | Ítem | Notas |
|---|---|---|
| 1 | `@qhago/react` | Hook `useScanner()` + `<Scanner />`; SSR-safe. También `@qhago/vue` y Svelte si hay demanda |
| 2 | `@qhago/capacitor` | Plugin Capacitor: en web usa `@qhago/scanner`; en nativo, ML Kit (Android) / Vision (iOS) o ZXing-C++ nativo, misma API |
| 3 | `react-native-qhago` | Frame processor para `react-native-vision-camera` con ZXing-C++ nativo (JSI) |
| 4 | Flutter | Plugin con FFI a ZXing-C++; evaluar si aporta frente a `mobile_scanner` |
| 5 | Modo lote / inventario | Escaneo continuo de muchos códigos con lista, conteo y exportación |
| 6 | DataBar / MicroQR / rMQR | Si ZXing-C++ los soporta de forma estable; se añaden al tipo `BarcodeFormat` en una minor |
| 7 | Escaneo de PDF | Integración opcional con pdf.js (paquete aparte) |
| 8 | Detector IA v2 | Segmentación de códigos curvados (desenrollado cilíndrico) si G5 mostró valor |
| 9 | Telemetría opcional | **Opt-in**, anónima, solo métricas de rendimiento para mejorar defaults |

## Criterio para priorizar

1. Issues/feedback de usuarios tras 1.0.
2. Descargas npm por entry point.
3. Resultados de `bench` que muestren huecos frente a competidores.

## Material archivado reutilizable

- `archive/wrappers/` (interfaces Flutter/RN/Capacitor del plan anterior).
- `archive/rust-core/` (si en algún momento se quiere un core nativo en Rust con `uniffi`).
