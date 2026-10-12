# Captura del conjunto `device` v2 (F10.4)

Objetivo: que las mejoras del escáner se aprueben con fotos reales de **muchos productos distintos**, no de 4.
Hoy `device` tiene 4 productos (todos en `dev`) y ninguno en `test`: `bun run bench/coverage.ts --dataset device`
muestra qué falta.

## 1. Lista de productos y split (antes de capturar)

1. Haz una lista de productos y apunta su código. Mínimos por split (`bench/dataset/targets.json`), para dev **y** test:

   | Tipo | Productos distintos |
   |---|---|
   | EAN-13 / UPC-A | 60 |
   | EAN-8 | 15 |
   | QR | 20 |
   | Code 128 | 15 |
   | Negativas (fotos sin código) | 100 |

2. Reparte los productos 50/50 entre `dev` y `test` en `bench/dataset/device/splits.json` (privado, no se versiona),
   mezclando tipos de envase en los dos:

   ```json
   { "7751234567890": "dev", "7759876543210": "test", "session:2026-11-02T10-00-00-abcd": "test" }
   ```

   La clave es el texto del código. `session:<id>` solo decide dónde van las **negativas** de esa sesión (por
   defecto `dev`). Un producto que no esté en `splits.json` se excluye con aviso.
3. Nunca se cambia un producto de split después de haber mirado resultados.

## 2. Cómo capturar

- Modo depuración de la demo (`apps/demo/debug-server.ts`), en el Android de referencia.
- Por producto, 3-5 fotos: cerca / distancia normal / lejos, recto y con ángulo, buena luz y luz de tienda.
- Variedad de envases: cajas (rígidos), bolsas y sachets (flexibles, arrugados), latas y botellas (curvos), etiquetas
  brillantes (reflejos).
- QR: en pantalla de otro celular y en papel. **No uses QR de pago reales con datos personales**: genera QR de prueba
  (mismo tamaño y densidad).
- Code 128: etiquetas internas, guías de envío, cajas de distribuidor.
- Negativas: estantes, etiquetas de precio sin código, texto, rejillas, persianas, envases por la cara sin código.
- Sin caras ni datos personales en el encuadre (ADR-12).

## 3. Veredictos (`veredictos.json` v2 en la carpeta de la sesión)

```json
{
  "_version": 2,
  "_productos": {
    "leche": { "format": "ean_13", "text": "7751234567890" },
    "qr-prueba-1": { "format": "qr_code", "text": "https://ejemplo.pe/1" }
  },
  "0001": "S:leche",
  "0002": "M:qr-prueba-1",
  "0003": "N",
  "0004": "S:leche+qr-prueba-1"
}
```

- `S` = se lee a simple vista (debería leerse), `M` = dudosa, `N` = sin código legible.
- Varios productos en una foto con `+` (todos deben estar en el mismo split; si no, la foto se excluye).
- Etiqueta sin mirar qué leyó el escáner (sin sesgo hacia ningún motor).

## 4. Construir y comprobar

```bash
python3 bench/dataset/device/build.py              # → bench/dataset/device/manifest.jsonl (privado)
cd bench && bun run coverage.ts --dataset device --strict
bun run device-eval.ts --split dev                  # vista rápida
bun run cli.ts --dataset device --split dev --engines qhago,qhago+ai,zxing-wasm   # con IC y por objeto
```

`device/test` solo se ejecuta para cierres de fase (`--reason`, queda registrado).
