import { createRequire } from "node:module";

let zxingModule = null;

function loadZxingFactory() {
  if (typeof globalThis.window !== "undefined") {
    return import("./zxing_barcode.js").then((m) => {
      const factory = m.default || m.ZXingBarcode;
      if (typeof factory === "function") return factory;
      throw new Error("ZXing export not found");
    });
  }
  const require = createRequire(import.meta.url);
  const factory = require("./zxing_barcode.js");
  const fn = factory.default || factory.ZXingBarcode || factory;
  if (typeof fn === "function") return Promise.resolve(fn);
  throw new Error(`ZXing factory not found. Type: ${typeof factory}`);
}

export async function initZxing(wasmUrl) {
  if (zxingModule) return;
  const factory = await loadZxingFactory();
  zxingModule = await factory({
    locateFile: (path) => {
      if (path.endsWith(".wasm")) {
        return wasmUrl || new URL("./zxing_barcode.wasm", import.meta.url).href;
      }
      return path;
    },
  });
}

export function zxing_decode_b64(dataB64, width, height, format) {
  if (!zxingModule) return null;
  try {
    const binaryStr = typeof atob !== "undefined" ? atob(dataB64) : Buffer.from(dataB64, "base64").toString("binary");
    const imgSize = width * height;
    if (binaryStr.length < imgSize) return null;

    const data = new Uint8Array(imgSize);
    for (let i = 0; i < imgSize; i++) data[i] = binaryStr.charCodeAt(i);

    const zxDataPtr = zxingModule._malloc(imgSize);
    const zxResultBuf = zxingModule._malloc(4096);
    zxingModule.HEAPU8.set(data, zxDataPtr);

    let formatCStr = 0;
    if (format && format.length > 0) {
      const enc = new TextEncoder().encode(format + "\0");
      formatCStr = zxingModule._malloc(enc.length);
      zxingModule.HEAPU8.set(enc, formatCStr);
    }

    const resultLen = zxingModule._zxing_read_barcode(
      zxDataPtr, width, height,
      formatCStr || 0,
      zxResultBuf, 4096
    );

    let result = null;
    if (resultLen > 0) {
      const resultBytes = new Uint8Array(resultLen);
      resultBytes.set(new Uint8Array(zxingModule.HEAPU8.buffer, zxResultBuf, resultLen));
      result = new TextDecoder().decode(resultBytes);
    }

    zxingModule._free(zxDataPtr);
    zxingModule._free(zxResultBuf);
    if (formatCStr) zxingModule._free(formatCStr);
    return result;
  } catch (e) {
    return null;
  }
}

export function zxing_version() {
  if (!zxingModule) return "not loaded";
  const ptr = zxingModule._zxing_version();
  if (!ptr) return "unknown";
  const view = new Uint8Array(zxingModule.HEAPU8.buffer, ptr, 64);
  let len = 0;
  while (len < 64 && view[len] !== 0) len++;
  return new TextDecoder().decode(view.slice(0, len));
}
