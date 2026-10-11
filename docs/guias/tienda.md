# Escáner para tiendas con el celular

Configuración recomendada para una app de bodega/tienda que escanea productos con la cámara del celular.

## Formatos

Pide solo lo que la tienda usa: menos formatos = menos trabajo por frame y menos riesgo de lecturas falsas.

```ts
import { createScanner } from "@qhago/scanner";

const scanner = createScanner({
  video: document.querySelector("video"),
  // productos (EAN/UPC), códigos internos (Code 128) y QR (pagos, catálogos)
  formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"],
});
scanner.on("detect", ({ result }) => agregarProducto(result.text));
await scanner.start();
```

Con `<qhago-scanner>`: `formats="ean_13,ean_8,upc_a,upc_e,code_128,qr_code"`.

## Qué hace la librería por ti

- **Códigos algo desenfocados**: además de ZXing, un lector por deconvolución lee EAN-13/UPC-A cuyas barras
  finas ya no se distinguen (frecuente a 10-20 cm con cámaras de gama media).
- **Confirmación**: un EAN leído con poco respaldo (pocas líneas, o por las pasadas de escalado) se confirma
  en 2 frames antes de avisar; uno nítido se avisa en el primer frame.
- **Ritmo**: el escalado (barridos, deblur, IA) se reparte entre frames y tiene un tope de tiempo, para que
  el lector nunca esté ocupado cuando el código entra en cuadro.

## Consejos para el usuario de la tienda

- A unos 15-25 cm, con el código ocupando ~1/3 del ancho. Muy cerca, la cámara no enfoca.
- Con buena luz y sin reflejos directos sobre el plástico; en envases arrugados (sobres, bolsas), estirar
  la zona del código.
- Mantener el celular quieto medio segundo: los frames sin movimiento son los que se leen.

## El detector IA (`@qhago/ai`)

Ayuda con códigos pequeños, inclinados o en fondos complicados. En un Android de gama media cada inferencia
tarda ~1 s; la librería la limita al 25 % del tiempo de vídeo. Úsalo si tu catálogo tiene muchos códigos
difíciles; para productos de tienda típicos, el lector sin IA ya cubre la mayoría.

## Límites conocidos

- Envases flexibles muy arrugados pueden deformar el código de forma consistente: la librería descarta las
  lecturas contradictorias y confirma en 2 frames, pero en casos extremos el código "visto" no es el impreso.
  Si tu app permite corregir manualmente, muestra el número leído al cajero.
