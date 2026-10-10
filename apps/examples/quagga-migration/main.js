// Antes:  import Quagga from "@ericblade/quagga2";
import Quagga from "@qhago/scanner/quagga-compat";

Quagga.init(
  {
    inputStream: {
      type: "LiveStream",
      target: document.querySelector("#interactive"),
      constraints: { width: 640, height: 480, facingMode: "environment" },
    },
    locator: { patchSize: "medium", halfSample: true },
    numOfWorkers: 2,
    frequency: 10,
    decoder: { readers: ["ean_reader", "code_128_reader"] },
    locate: true,
  },
  (err) => {
    if (err) {
      console.error(err);
      return;
    }
    Quagga.start();
  },
);

Quagga.onProcessed((result) => {
  const ctx = Quagga.canvas.ctx.overlay;
  const canvas = Quagga.canvas.dom.overlay;
  if (!result) return;
  ctx.clearRect(0, 0, Number(canvas.getAttribute("width")), Number(canvas.getAttribute("height")));
  if (result.boxes) {
    for (const box of result.boxes.filter((b) => b !== result.box)) {
      Quagga.ImageDebug.drawPath(box, { x: 0, y: 1 }, ctx, { color: "green", lineWidth: 2 });
    }
  }
  if (result.box)
    Quagga.ImageDebug.drawPath(result.box, { x: 0, y: 1 }, ctx, { color: "#00F", lineWidth: 2 });
  if (result.codeResult?.code)
    Quagga.ImageDebug.drawPath(result.line, { x: "x", y: "y" }, ctx, {
      color: "red",
      lineWidth: 3,
    });
});

Quagga.onDetected((result) => {
  const li = document.createElement("li");
  li.textContent = `${result.codeResult.format}: ${result.codeResult.code}`;
  document.querySelector("#result_strip").prepend(li);
});
