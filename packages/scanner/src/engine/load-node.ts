import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import createEngine from "../../wasm/qhago_engine_node.mjs";
import { getConfig } from "../config";
import { ScanError } from "../errors";
import { Engine } from "./engine";
import { instantiate } from "./module";

let enginePromise: Promise<Engine> | null = null;

async function compile(): Promise<WebAssembly.Module> {
  const cfg = getConfig();
  if (cfg.wasmModule) return cfg.wasmModule;
  const url = cfg.wasmUrl ?? new URL("./qhago_engine_node.wasm", import.meta.url);
  try {
    const u = typeof url === "string" ? new URL(url, `file://${process.cwd()}/`) : url;
    const bytes =
      u.protocol === "file:"
        ? await readFile(fileURLToPath(u))
        : new Uint8Array(await (await fetch(u)).arrayBuffer());
    return await WebAssembly.compile(bytes);
  } catch (e) {
    throw new ScanError("ENGINE_LOAD_FAILED", `No se pudo cargar el motor desde ${String(url)}`, {
      cause: e,
    });
  }
}

export function loadEngine(): Promise<Engine> {
  enginePromise ??= compile()
    .then((mod) => instantiate(createEngine, mod))
    .then((m) => new Engine(m))
    .catch((e) => {
      enginePromise = null;
      throw e;
    });
  return enginePromise;
}

export function resetEngine(): void {
  enginePromise = null;
}
