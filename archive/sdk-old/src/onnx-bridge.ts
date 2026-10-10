/**
 * onnx-bridge.ts — ONNX Runtime Web bridge for ScanAI SDK.
 *
 * Manages ONNX model sessions and exposes functions that
 * the Rust WASM core imports via #[wasm_bindgen(raw_module)].
 *
 * Uses onnxruntime-web (MIT) for inference in browser.
 *
 * API exposed to Rust (via raw_module import):
 *   onnx_load(b64_model_bytes: string): number (session ID, 0 = error)
 *   onnx_run(session_id: number, b64_input: string, shape_json: string): string | null
 *   onnx_free(session_id: number): void
 */

import * as ort from "onnxruntime-web";

const sessions = new Map();

ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;

function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64ToFloats(b64) {
  const bytes = b64ToBytes(b64);
  const floats = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  return new Float32Array(floats);
}

function floatsToB64(floats) {
  const bytes = new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength);
  let b64 = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const t = (a << 16) | (b << 8) | c;
    b64 += chars[(t >> 18) & 63];
    b64 += chars[(t >> 12) & 63];
    b64 += i + 1 < bytes.length ? chars[(t >> 6) & 63] : "=";
    b64 += i + 2 < bytes.length ? chars[t & 63] : "=";
  }
  return b64;
}

let nextSessionId = 1;

/**
 * Loads an ONNX model from base64-encoded bytes.
 * Called from Rust via wasm-bindgen.
 *
 * @param {string} b64ModelBytes - Base64-encoded .onnx file
 * @returns {number} Session ID (>0) or 0 on error
 */
export async function onnx_load(b64ModelBytes) {
  try {
    const bytes = b64ToBytes(b64ModelBytes);
    const session = await ort.InferenceSession.create(bytes, {
      executionProviders: ["webgl", "wasm"],
      graphOptimizationLevel: "all",
      enableCpuMemArena: true,
    });
    const id = nextSessionId++;
    sessions.set(id, { session, inputName: session.inputNames[0] });
    console.log("[ONNX] Session", id, "loaded. Input:", session.inputNames, "Output:", session.outputNames);
    return id;
  } catch (e) {
    console.error("[ONNX] Load failed:", e.message);
    return 0;
  }
}

/**
 * Runs inference on a loaded model.
 *
 * @param {number} sessionId - Session ID from onnx_load
 * @param {string} b64Input - Base64-encoded Float32Array of input tensor
 * @param {string} shapeJson - JSON array of shape, e.g. "[1,3,320,320]"
 * @returns {string|null} Base64-encoded Float32Array of output, or null
 */
export async function onnx_run(sessionId, b64Input, shapeJson) {
  try {
    const entry = sessions.get(sessionId);
    if (!entry) return null;

    const inputFloats = b64ToFloats(b64Input);
    const shape = JSON.parse(shapeJson);

    const tensor = new ort.Tensor("float32", inputFloats, shape);
    const outputs = await entry.session.run({ [entry.inputName]: tensor });

    const outputName = entry.session.outputNames[0];
    const outputTensor = outputs[outputName];

    return floatsToB64(outputTensor.data);
  } catch (e) {
    console.error("[ONNX] Run failed:", e.message);
    return null;
  }
}

/**
 * Frees a loaded model session.
 *
 * @param {number} sessionId
 */
export function onnx_free(sessionId) {
  const entry = sessions.get(sessionId);
  if (entry) {
    entry.session.release();
    sessions.delete(sessionId);
  }
}

/**
 * Returns input shape of a loaded model as JSON string.
 * Useful for Rust to know expected tensor dimensions.
 *
 * @param {number} sessionId
 * @returns {string} JSON array of input shape
 */
export function onnx_input_shape(sessionId) {
  const entry = sessions.get(sessionId);
  if (!entry) return "[]";
  const meta = entry.session.inputNames.map((name) => {
    const shape = entry.session.inputShapes?.[name] || [];
    return shape;
  });
  return JSON.stringify(meta[0] || []);
}

/**
 * Returns output names of a loaded model as JSON.
 */
export function onnx_output_names(sessionId) {
  const entry = sessions.get(sessionId);
  if (!entry) return "[]";
  return JSON.stringify(entry.session.outputNames);
}
