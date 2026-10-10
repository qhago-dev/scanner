import { aiDetector, aiWorker } from "@qhago/ai";
import { createScanner } from "@qhago/scanner";

const scanner = createScanner({
  video: document.querySelector("#video"),
  // El worker de @qhago/ai incluye el motor de @qhago/scanner y el detector (ONNX Runtime Web).
  workerFactory: aiWorker,
  // "fallback": el detector solo corre cuando el motor clásico no lee nada durante unos frames.
  plugins: [aiDetector({ when: "fallback" })],
});
scanner.on("detect", (e) => {
  document.querySelector("#out").textContent = `${e.result.format}: ${e.result.text}`;
});
scanner.on("error", (e) => console.error(e.error));
await scanner.start();
