import { getConfig } from "../config";
import { loadModule } from "../engine/load-browser";
import { ScanError } from "../errors";
import { type ImageInput, isImageDataLike, isRawImage } from "../input/common";
import type { BarcodeResult, DecodeWithErrors } from "../types";
import type { FromDecodeWorker, ToDecodeWorker, WireOptions } from "./protocol";

let worker: Worker | null = null;
let ready: Promise<Worker> | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (v: BarcodeResult[] | DecodeWithErrors) => void; reject: (e: unknown) => void }
>();

/** true en el main thread de un navegador con lo necesario para el worker. */
export function canUseWorker(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    typeof Worker === "function" &&
    typeof OffscreenCanvas === "function" &&
    typeof createImageBitmap === "function"
  );
}

/** Crea un worker módulo; si la URL es de otro origen (CDN), arranca desde un Blob que la importa (ADR-06). */
export function createModuleWorker(url: string | URL): Worker {
  const u = new URL(String(url), location.href);
  if (u.origin === location.origin) return new Worker(u, { type: "module" });
  const boot = URL.createObjectURL(
    new Blob([`import ${JSON.stringify(u.href)};`], { type: "text/javascript" }),
  );
  return new Worker(boot, { type: "module" });
}

function spawn(): Promise<Worker> {
  ready ??= (async () => {
    const cfg = getConfig();
    const w = cfg.workerFactory
      ? cfg.workerFactory()
      : createModuleWorker(cfg.workerUrl ?? new URL("./decode-worker.js", import.meta.url));
    const mod = await loadModule();
    await new Promise<void>((resolve, reject) => {
      const onError = (ev: ErrorEvent) =>
        reject(
          new ScanError(
            "ENGINE_LOAD_FAILED",
            `No se pudo iniciar el worker de decode: ${ev.message}`,
          ),
        );
      w.addEventListener("error", onError, { once: true });
      w.onmessage = (e: MessageEvent<FromDecodeWorker>) => {
        const m = e.data;
        if (m.t === "ready") {
          w.removeEventListener("error", onError);
          resolve();
          return;
        }
        const p = pending.get(m.id);
        if (!p) return;
        pending.delete(m.id);
        if (m.t === "result") p.resolve(m.value);
        else p.reject(new ScanError(m.code, m.message));
      };
      w.postMessage({ t: "init", wasmModule: mod } satisfies ToDecodeWorker);
    });
    worker = w;
    return w;
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

/** Prepara la entrada para cruzar al worker sin tocar los objetos del usuario. */
async function toWire(input: ImageInput): Promise<[ImageInput, Transferable[]]> {
  if (isRawImage(input)) {
    const data = input.data.slice();
    return [{ ...input, data }, [data.buffer]];
  }
  if (isImageDataLike(input)) {
    const data = new Uint8ClampedArray(input.data);
    return [{ data, width: input.width, height: input.height, format: "rgba" }, [data.buffer]];
  }
  if (typeof VideoFrame === "function" && input instanceof VideoFrame) {
    const f = input.clone();
    return [f, [f as unknown as Transferable]];
  }
  if (input instanceof ArrayBuffer || input instanceof Uint8Array)
    return [new Blob([input as BlobPart]), []];
  if (input instanceof Blob) return [input, []];
  if (
    typeof HTMLImageElement === "function" &&
    input instanceof HTMLImageElement &&
    !input.complete
  )
    await input.decode();
  const bmp = await createImageBitmap(input as ImageBitmapSource);
  return [bmp, [bmp]];
}

export async function decodeInWorker(
  input: ImageInput,
  options: WireOptions,
  signal?: AbortSignal,
): Promise<BarcodeResult[] | DecodeWithErrors> {
  const w = await spawn();
  const [wire, transfer] = await toWire(input);
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const onAbort = () => {
      pending.delete(id);
      reject(new ScanError("ABORTED", "Operación abortada", { cause: signal?.reason }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    w.postMessage({ t: "decode", id, input: wire, options } satisfies ToDecodeWorker, transfer);
  });
}

/** Precalienta el worker (init()). */
export function warmWorker(): Promise<unknown> {
  return spawn();
}

/** Solo tests. */
export function terminateWorker(): void {
  worker?.terminate();
  worker = null;
  ready = null;
}
