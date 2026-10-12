// El usuario decodifica dentro de SU propio worker (Vite lo construye en iife por defecto).
const w = new Worker(new URL("./scan-worker.js", import.meta.url));
w.onmessage = (e) => {
  window.__result = e.data;
};
fetch("/fixture.png")
  .then((r) => r.blob())
  .then((b) => w.postMessage(b));
