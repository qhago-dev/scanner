// Navegador (vitest browser mode): src/ se sirve con Vite; el .wasm y el worker se apuntan explícitamente.
import { configure } from "../../src/config";

export function configureForTests(): void {
  configure({
    wasmUrl: new URL("../../wasm/qhago_engine.wasm", import.meta.url),
    workerFactory: () =>
      new Worker(new URL("../../src/worker/decode-worker.ts", import.meta.url), { type: "module" }),
  });
}

export async function fixture(name: string): Promise<Blob> {
  const res = await fetch(new URL(`../fixtures/${name}`, import.meta.url));
  return res.blob();
}

export async function bitmapOf(name: string): Promise<ImageBitmap> {
  return createImageBitmap(await fixture(name));
}

export function canvasOf(bmp: ImageBitmap): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext("2d")?.drawImage(bmp, 0, 0);
  return c;
}
