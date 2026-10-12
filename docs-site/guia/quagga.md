# Migrar desde Quagga2

Cambia el import; la configuración de Quagga2 se traduce a opciones del escáner:

```ts
// Antes:  import Quagga from "@ericblade/quagga2";
import Quagga from "@qhago/scanner/quagga-compat";

Quagga.init({ inputStream: { type: "LiveStream", target: "#interactive" },
              decoder: { readers: ["ean_reader", "code_128_reader"] } }, (err) => {
  if (!err) Quagga.start();
});
Quagga.onDetected((r) => console.log(r.codeResult.code));
```

Compatibles: `init`, `start`, `stop`, `pause`, `decodeSingle`, `onDetected`/`onProcessed` (y `off…`),
`setReaders`, `canvas`, `ImageDebug.drawPath`/`drawRect` y `CameraAccess` (incluida la linterna). Opciones de
Quagga2 que no aplican (`locator`, `numOfWorkers`, `frequency`…) se aceptan y se ignoran: el motor localiza solo y
trabaja en un worker. `result.codeResult.format` usa los nombres de Quagga2 (`ean_13`, `code_128`…).

Diferencias: además de 1D, lee 2D (QR, DataMatrix…) si los añades al lector correspondiente o usas la API nativa;
en el benchmark de fotos públicas lee bastante más y con menos lecturas falsas (ver [Benchmark](/benchmark)).
