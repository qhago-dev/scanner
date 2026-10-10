// Worker interno de decode() (ADR-02). Un único módulo sin import() dinámicos (Vite construye workers en iife).
import { configure } from "../config";
import { decodeInline } from "../core";
import { isScanError } from "../errors";
import { browserPlatform } from "../platform-browser";
import type { FromDecodeWorker, ToDecodeWorker } from "./protocol";

const post = (m: FromDecodeWorker) => (self as unknown as Worker).postMessage(m);

self.onmessage = async (e: MessageEvent<ToDecodeWorker>) => {
  const m = e.data;
  if (m.t === "init") {
    configure({ wasmModule: m.wasmModule });
    post({ t: "ready" });
    return;
  }
  try {
    const value = await decodeInline(browserPlatform, m.input, { ...m.options, worker: false });
    post({ t: "result", id: m.id, value });
  } catch (err) {
    post({
      t: "error",
      id: m.id,
      code: isScanError(err) ? err.code : "INVALID_INPUT",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    if (typeof VideoFrame === "function" && m.input instanceof VideoFrame) m.input.close();
    else if (typeof ImageBitmap === "function" && m.input instanceof ImageBitmap) m.input.close();
  }
};
