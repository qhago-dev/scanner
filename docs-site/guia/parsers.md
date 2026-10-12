# Parsers de contenido

`@qhago/scanner/parsers` interpreta el `text` de un resultado:

```ts
import { parseAAMVA, parseGS1, parseISO15434, parseQRContent } from "@qhago/scanner/parsers";

parseGS1("(01)09506000134352(17)251231(10)LOTE1");
// → { gtin: "09506000134352", expiry: "2025-12-31", batch: "LOTE1", ais: {...}, elements: [...], errors: [] }

parseQRContent("WIFI:T:WPA;S:Tienda;P:secreto;;"); // → { type: "wifi", ssid: "Tienda", password: "secreto", ... }
parseAAMVA(pdf417Text);  // licencias de conducir (EE. UU./Canadá) → nombre, fechas, dirección… o null
parseISO15434(text);     // sobres ISO/IEC 15434 (DataMatrix industriales) → elementos (y GS1 si aplica)
```

- `parseGS1` acepta la forma legible con paréntesis y la cruda con separador `\x1d` (la que da `text` por defecto en
  GS1-128/DataMatrix GS1). `gs1CheckDigit` calcula el dígito de control de un GTIN/SSCC.
- `parseQRContent` reconoce URL, WiFi, vCard, MECARD, email, teléfono, SMS, geo y texto libre.
- Ningún parser lanza con datos inválidos: `parseAAMVA`/`parseISO15434` devuelven `null` y `parseGS1` devuelve lo
  que pudo interpretar (los AI desconocidos o mal formados van a `errors`).
