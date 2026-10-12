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
    // Empaquetadores para Node/Bun (bun build, esbuild, ncc…) no copian el .wasm de new URL(…, import.meta.url).
    const missing = (e as NodeJS.ErrnoException)?.code === "ENOENT" && !cfg.wasmUrl;
    throw new ScanError(
      "ENGINE_LOAD_FAILED",
      `No se pudo cargar el motor desde ${String(url)}` +
        (missing
          ? ". Si empaquetaste la app (bun build, esbuild, ncc…), copia" +
            " node_modules/@qhago/scanner/wasm/qhago_engine_node.wasm junto al bundle o indica la ruta con" +
            " configure({ wasmUrl })."
          : ""),
      { cause: e },
    );
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
