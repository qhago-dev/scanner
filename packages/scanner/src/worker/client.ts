import { getConfig } from "../config";
import { loadModule } from "../engine/load-browser";
import { ScanError } from "../errors";
import { type ImageInput, isImageDataLike, isRawImage } from "../input/common";
import { missingPluginError } from "../plugins";
import type { BarcodeResult, DecodeWithErrors, ScannerPluginDescriptor } from "../types";
import type { FromWorker, ToWorker, WireOptions } from "./protocol";

// Un worker por fábrica (undefined = el de la config global / interno).
const workers = new Map<(() => Worker) | undefined, Promise<Worker>>();
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (v: BarcodeResult[] | DecodeWithErrors) => void; reject: (e: unknown) => void }
>();

/** Plugins que anunció cada worker en su mensaje "ready". */
const workerPlugins = new WeakMap<Worker, string[]>();

/** Lanza UNSUPPORTED si el worker no registra alguno de los plugins pedidos. */
export function assertPlugins(
  w: Worker | null,
  wanted: readonly ScannerPluginDescriptor[] | undefined,
): void {
  const have = (w && workerPlugins.get(w)) || [];
  const missing = (wanted ?? []).map((d) => d.name).filter((n) => !have.includes(n));
  if (missing.length) throw missingPluginError(missing);
}

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

const WORKER_HINT =
  "Si hay CSP, permite worker-src 'self' blob: (y el origen del CDN si el paquete viene de otro origen); " +
  "o configura workerUrl, o usa worker: false.";

/** Tiempo máximo hasta "ready" (descarga del worker + instanciación del motor). */
const READY_TIMEOUT_MS = 20_000;

function workerError(detail: string, cause?: unknown): ScanError {
  return new ScanError(
    "ENGINE_LOAD_FAILED",
    `No se pudo iniciar el worker: ${detail}. ${WORKER_HINT}`,
    { cause },
  );
}

/** Crea un worker (workerFactory, workerUrl o el interno), le pasa el módulo WASM compilado y espera "ready". */
export async function createReadyWorker(
  onMessage?: (m: FromWorker) => void,
  factory?: () => Worker,
): Promise<Worker> {
  const cfg = getConfig();
  const make = factory ?? cfg.workerFactory;
  let w: Worker;
  try {
    w = make
      ? make()
      : createModuleWorker(cfg.workerUrl ?? new URL("./worker.js", import.meta.url));
  } catch (e) {
    throw workerError(String((e as Error)?.message ?? e), e);
  }
  const mod = await loadModule();
  await new Promise<void>((resolve, reject) => {
    // Un worker bloqueado por CSP no siempre dispara "error" (Chromium): se escucha la violación y hay timeout.
    const doc = typeof document !== "undefined" ? document : null;
    const cleanup = () => {
      clearTimeout(timer);
      w.removeEventListener("error", onError);
      doc?.removeEventListener("securitypolicyviolation", onCsp);
    };
    const fail = (err: ScanError) => {
      cleanup();
      w.terminate();
      reject(err);
    };
    const onError = (ev: ErrorEvent) => fail(workerError(ev.message || "error de carga"));
    const onCsp = (ev: SecurityPolicyViolationEvent) => {
      const dir = ev.effectiveDirective || ev.violatedDirective;
      // Solo violaciones del propio worker (no imágenes, estilos u otros scripts de la página).
      const ours =
        /^worker-src/.test(dir) ||
        (/^(script|child|default)-src/.test(dir) && /^blob:|worker/.test(ev.blockedURI));
      if (ours)
        fail(
          workerError(
            `bloqueado por CSP (${ev.effectiveDirective || ev.violatedDirective} → ${ev.blockedURI})`,
          ),
        );
    };
    const timer = setTimeout(
      () => fail(workerError(`sin respuesta en ${READY_TIMEOUT_MS / 1000} s`)),
      READY_TIMEOUT_MS,
    );
    w.addEventListener("error", onError, { once: true });
    doc?.addEventListener("securitypolicyviolation", onCsp);
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      if (e.data.t === "ready") {
        workerPlugins.set(w, e.data.plugins ?? []);
        cleanup();
        resolve();
      } else {
        onMessage?.(e.data);
      }
    };
    w.postMessage({ t: "init", wasmModule: mod } satisfies ToWorker);
  });
  return w;
}

function spawn(factory?: () => Worker): Promise<Worker> {
  const cached = workers.get(factory);
  if (cached) return cached;
  const ready = createReadyWorker((m) => {
    if (m.t !== "result" && m.t !== "error") return; // el worker de decode() no abre sesiones
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.t === "result") p.resolve(m.value);
    else p.reject(new ScanError(m.code, m.message));
  }, factory).catch((e) => {
    workers.delete(factory);
    throw e;
  });
  workers.set(factory, ready);
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
  factory?: () => Worker,
): Promise<BarcodeResult[] | DecodeWithErrors> {
  const w = await spawn(factory);
  assertPlugins(w, options.plugins);
  const [wire, transfer] = await toWire(input);
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const onAbort = () => {
      pending.delete(id);
      reject(new ScanError("ABORTED", "Operación abortada", { cause: signal?.reason }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    w.postMessage({ t: "decode", id, input: wire, options } satisfies ToWorker, transfer);
  });
}

/** Precalienta el worker (init()). */
export function warmWorker(): Promise<unknown> {
  return spawn();
}

/** Solo tests. */
export function terminateWorker(): void {
  for (const r of workers.values())
    r.then(
      (w) => w.terminate(),
      () => {},
    );
  workers.clear();
}
