/**
 * test-zxing.mjs — Test ZXing WASM decoding with valid barcodes.
 *
 * Uses JsBarcode (MIT) to generate valid Code128 and EAN-13 barcodes,
 * then decodes them with ZXing-C++ via the wrapper.
 *
 * Run: node --experimental-wasm-modules test-zxing.mjs
 */

import { initZxing, zxing_decode_b64, zxing_version } from "./zxing-wrapper.js";
import JsBarcode from "jsbarcode";
import { createCanvas } from "canvas";

function b64FromCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const gray = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < gray.length; i++) {
    const r = imageData.data[i * 4];
    const g = imageData.data[i * 4 + 1];
    const b = imageData.data[i * 4 + 2];
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return Buffer.from(gray).toString("base64");
}

function generateBarcode(text, format, options = {}) {
  const defaults = { width: 2, height: 80, fontSize: 0, margin: 5 };
  const canvas = createCanvas(300, 100);
  JsBarcode(canvas, text, {
    format,
    ...defaults,
    ...options,
    displayValue: false,
  });
  return { canvas, b64: b64FromCanvas(canvas) };
}

async function main() {
  console.log("=== ZXing WASM Decoding Test ===\n");

  console.log("1. Initializing ZXing WASM...");
  await initZxing();
  console.log(`   Version: ${zxing_version()}\n`);

  const testCases = [
    { text: "5901234123457", format: "EAN13", zxFormat: "EAN-13", desc: "EAN-13" },
    { text: "1234567890128", format: "EAN13", zxFormat: "EAN-13", desc: "EAN-13 (alt)" },
    { text: "HELLO", format: "CODE128", zxFormat: "Code128", desc: "Code128 text" },
    { text: "SCAN-001", format: "CODE128", zxFormat: "Code128", desc: "Code128 alphanum" },
    { text: "1234567890", format: "CODE128", zxFormat: "Code128", desc: "Code128 numeric" },
  ];

  let passed = 0;
  let failed = 0;
  const times = [];

  for (const tc of testCases) {
    console.log(`Testing: ${tc.desc} "${tc.text}"`);
    try {
      const { canvas, b64 } = generateBarcode(tc.text, tc.format);

      const start = performance.now();
      const result = zxing_decode_b64(b64, canvas.width, canvas.height, tc.zxFormat);
      const elapsed = performance.now() - start;

      if (result === tc.text) {
        console.log(`  ✓ PASS (${elapsed.toFixed(1)}ms) -> "${result}"`);
        passed++;
      } else {
        console.log(`  ✗ FAIL (${elapsed.toFixed(1)}ms) -> got "${result}", expected "${tc.text}"`);
        failed++;
      }
      times.push(elapsed);
    } catch (e) {
      console.log(`  ✗ ERROR: ${e.message}`);
      failed++;
    }
  }

  const avgTime = times.length > 0 ? (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1) : 0;

  console.log(`\n========================================`);
  console.log(`Results: ${passed} passed, ${failed} failed, avg ${avgTime}ms`);
  console.log(`========================================`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
