import createEngine from "../../wasm/qhago_engine.mjs";
import { getConfig } from "../config";
import { ScanError } from "../errors";
import { Engine } from "./engine";
import { instantiate } from "./module";

let modulePromise: Promise<WebAssembly.Module> | null = null;
let enginePromise: Promise<Engine> | null = null;

function hint(url: string): string {
  if (url.includes("/.vite/deps/")) {
    return ' Parece Vite en modo dev: añade optimizeDeps: { exclude: ["@qhago/scanner"] } a vite.config.';
  }
  return " Revisa que el .wasm se sirva desde esa URL (y con CORS si es de otro origen).";
}

/** Compila (una vez) el WebAssembly.Module del motor de navegador. */
export function loadModule(): Promise<WebAssembly.Module> {
  const cfg = getConfig();
  if (cfg.wasmModule) return Promise.resolve(cfg.wasmModule);
  modulePromise ??= (async () => {
    const url = String(cfg.wasmUrl ?? new URL("./qhago_engine.wasm", import.meta.url));
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (
        typeof WebAssembly.compileStreaming === "function" &&
        res.headers.get("content-type")?.startsWith("application/wasm")
      ) {
        return await WebAssembly.compileStreaming(res);
      }
      return await WebAssembly.compile(await res.arrayBuffer());
    } catch (e) {
      modulePromise = null;
      throw new ScanError(
        "ENGINE_LOAD_FAILED",
        `No se pudo cargar el motor desde ${url}.${hint(url)}`,
        { cause: e },
      );
    }
  })();
  return modulePromise;
}

export function loadEngine(): Promise<Engine> {
  enginePromise ??= loadModule()
    .then((mod) => instantiate(createEngine, mod))
    .then((m) => new Engine(m))
    .catch((e) => {
      enginePromise = null;
      throw e;
    });
  return enginePromise;
}

export function resetEngine(): void {
  modulePromise = null;
  enginePromise = null;
}
