import { initZxing, zxing_decode_raw, zxing_version, isReady } from "./zxing-wrapper.js";

const video = document.getElementById("video");
const offscreen = document.createElement("canvas");
const ctx = offscreen.getContext("2d", { willReadFrequently: true });
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const textEl = resultEl.querySelector(".text");
const metaEl = resultEl.querySelector(".meta");
const btnToggle = document.getElementById("btn-toggle");
const symSelect = document.getElementById("sym-select");
const btnCopy = document.getElementById("btn-copy");
const btnTest = document.getElementById("btn-test");
const btnCapture = document.getElementById("btn-capture");
const preview = document.getElementById("preview");

let scanning = true;
let lastText = "";
let lastTime = 0;
let scanCount = 0;
let fps = 0;
let fpsFrames = 0;
let fpsLast = performance.now();
let lastScan = 0;
const SCAN_INTERVAL = 150;

let zxingReady = false;

async function start() {
  console.log("[ScanAI] Starting...");
  statusEl.textContent = "Loading ZXing-C++ WASM...";
  try {
    await initZxing();
    zxingReady = true;
    console.log("[ScanAI] ZXing loaded:", zxing_version());
    statusEl.textContent = `ZXing ${zxing_version()} loaded. Requesting camera...`;
  } catch (e) {
    console.error("[ScanAI] ZXing load failed:", e);
    statusEl.textContent = `ZXing failed: ${e.message}`;
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    console.log("[ScanAI] Camera started. Video:", video.videoWidth, "x", video.videoHeight);
    offscreen.width = 640;
    offscreen.height = 480;
    statusEl.textContent = "Ready — center barcode in the green rectangle";
    requestAnimationFrame(loop);
  } catch (e) {
    console.error("[ScanAI] Camera error:", e);
    statusEl.textContent = `Camera error: ${e.message}. Try test button below.`;
  }
}

let lastGrayCrop = null;
let lastGrayBin = null;
let lastGrayFull = null;
let lastRetW = 0;
let lastRetH = 0;
let frameCount = 0;
function loop(now) {
  if (!scanning) { requestAnimationFrame(loop); return; }
  fpsFrames++;
  if (now - fpsLast >= 1000) { fps = fpsFrames; fpsFrames = 0; fpsLast = now; }

  if (video.readyState >= video.HAVE_CURRENT_DATA && now - lastScan >= SCAN_INTERVAL) {
    frameCount++;
    lastScan = now;

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const drawW = vw;
    const drawH = vh;
    offscreen.width = drawW;
    offscreen.height = drawH;
    ctx.drawImage(video, 0, 0, drawW, drawH);

    const retW = Math.round(drawW * 0.85);
    const retH = Math.round(drawH * 0.55);
    const retX = Math.round((drawW - retW) / 2);
    const retY = Math.round((drawH - retH) / 2);

    const imageData = ctx.getImageData(retX, retY, retW, retH);

    if (frameCount === 1) {
      let min = 255, max = 0, sum = 0;
      for (let i = 0; i < retW * retH; i++) {
        const v = Math.round(0.299 * imageData.data[i*4] + 0.587 * imageData.data[i*4+1] + 0.114 * imageData.data[i*4+2]);
        if (v < min) min = v; if (v > max) max = v; sum += v;
      }
      console.log("[ScanAI] First crop:", retW, "x", retH, "px | pixel range:", min, "-", max, "| avg:", Math.round(sum/(retW*retH)));
    }
    const grayCrop = rgbaToGray(imageData.data, retW, retH);
    const grayFull = rgbaToGray(ctx.getImageData(0, 0, drawW, drawH).data, drawW, drawH);
    const grayBin = binarize(grayCrop, retW, retH);

    lastGrayCrop = grayCrop;
    lastGrayBin = grayBin;
    lastGrayFull = grayFull;
    lastRetW = retW;
    lastRetH = retH;

    if (preview) {
      const pctx = preview.getContext("2d");
      preview.width = retW;
      preview.height = retH;
      const out = pctx.createImageData(retW, retH);
      for (let i = 0; i < grayBin.length; i++) {
        out.data[i * 4] = grayBin[i];
        out.data[i * 4 + 1] = grayBin[i];
        out.data[i * 4 + 2] = grayBin[i];
        out.data[i * 4 + 3] = 255;
      }
      pctx.putImageData(out, 0, 0);
    }

    const format = symSelect.value || "";

    const t0 = performance.now();
    const resultRaw = zxing_decode_raw(grayFull, drawW, drawH, format)
      || zxing_decode_raw(grayCrop, retW, retH, format)
      || zxing_decode_raw(grayBin, retW, retH, format);
    const elapsed = (performance.now() - t0).toFixed(1);

    if (resultRaw) {
      if (resultRaw !== lastText || now - lastTime > 3000) {
        lastText = resultRaw;
        lastTime = now;
        scanCount++;
        textEl.textContent = resultRaw;
        metaEl.textContent = `${format || "auto"} · ${elapsed}ms · ${scanCount} scans · ${fps}FPS`;
        resultEl.classList.add("found");
        btnCopy.disabled = false;
        statusEl.textContent = `✓ Decoded in ${elapsed}ms`;
        if (navigator.vibrate) navigator.vibrate(30);
        setTimeout(() => resultEl.classList.remove("found"), 2000);
      }
    } else {
      frameCount++;
      if (frameCount % 30 === 0) {
        const samplePixels = grayFull.slice(0, 20).join(",");
        const hasDark = grayFull.some(v => v < 60);
        const hasLight = grayFull.some(v => v > 200);
        console.log(`[ScanAI] #${frameCount}: no decode | ${drawW}x${drawH} | pixels[0..19]=[${samplePixels}] | dark=${hasDark} light=${hasLight} | format="${format || 'auto'}"`);
      }
      statusEl.textContent = `Scanning... ${fps}FPS | ${retW}x${retH}px`;
    }
  }

  requestAnimationFrame(loop);
}

function rgbaToGray(rgba, w, h) {
  const len = w * h;
  const gray = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    gray[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
  }
  return gray;
}

function binarize(gray, w, h) {
  const len = w * h;
  let sum = 0;
  for (let i = 0; i < len; i++) sum += gray[i];
  const threshold = sum / len;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = gray[i] > threshold ? 255 : 0;
  return out;
}

btnTest.addEventListener("click", () => {
  if (!zxingReady) { statusEl.textContent = "ZXing not loaded yet"; return; }
  statusEl.textContent = "Testing with real barcode (JsBarcode)...";

  const off = document.createElement("canvas");
  off.width = 400;
  off.height = 100;
  try {
    JsBarcode(off, "5901234123457", { format: "EAN13", width: 2, height: 70, margin: 10, displayValue: false });
  } catch(e) {
    JsBarcode(off, "HELLO", { format: "CODE128", width: 2, height: 70, margin: 10, displayValue: false });
  }

  const img = off.getContext("2d").getImageData(0, 0, off.width, off.height);
  const gray = rgbaToGray(img.data, off.width, off.height);

  if (preview) {
    const pctx = preview.getContext("2d");
    preview.width = off.width; preview.height = off.height;
    pctx.putImageData(img, 0, 0);
  }

  const t0 = performance.now();
  const r1 = zxing_decode_raw(gray, off.width, off.height, "EAN-13");
  const r2 = zxing_decode_raw(gray, off.width, off.height, "");
  const t = (performance.now() - t0).toFixed(1);

  if (r1 || r2) {
    textEl.textContent = r1 || r2;
    metaEl.textContent = `SYNTHETIC TEST OK · ${t}ms · ZXing works!`;
    resultEl.classList.add("found");
    statusEl.textContent = `✓ ZXing works (${t}ms). Problem is camera: too dark/noisy/blurry. Try daylight or phone camera.`;
  } else {
    textEl.textContent = "FAILED";
    metaEl.textContent = `Synthetic test failed (${t}ms) — software bug.`;
    resultEl.classList.add("found");
    statusEl.textContent = "✗ ZXing cannot decode. Software bug in bridge.";
  }
  setTimeout(() => resultEl.classList.remove("found"), 4000);
});

btnToggle.addEventListener("click", () => {
  scanning = !scanning;
  btnToggle.textContent = scanning ? "Scanning" : "Paused";
  btnToggle.classList.toggle("active", scanning);
});

btnCapture.addEventListener("click", () => {
  const gray = toDataURL(lastGrayCrop || lastGrayFull, lastRetW, lastRetH);
  const bin = toDataURL(lastGrayBin, lastRetW, lastRetH);
  const ts = Date.now();
  fetch("/capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ts, gray, binary: bin }),
  }).then(() => {
    statusEl.textContent = `Frame captured! View at /captures`;
  }).catch(e => {
    statusEl.textContent = `Capture failed: ${e.message}`;
  });
});

function toDataURL(gray, w, h) {
  if (!gray) return "";
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const cx = c.getContext("2d");
  const img = cx.createImageData(w, h);
  for (let i = 0; i < gray.length; i++) {
    img.data[i*4] = gray[i];
    img.data[i*4+1] = gray[i];
    img.data[i*4+2] = gray[i];
    img.data[i*4+3] = 255;
  }
  cx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}
btnCopy.addEventListener("click", () => {
  if (lastText) {
    navigator.clipboard.writeText(lastText).then(() => {
      btnCopy.textContent = "Copied!";
      setTimeout(() => (btnCopy.textContent = "Copy"), 1500);
    });
  }
});

const btnOnnx = document.getElementById("btn-onnx");
btnOnnx.addEventListener("click", async () => {
    console.log("[ONNX] Button clicked, checking ort...");
    statusEl.textContent = "Testing ONNX Runtime Web (WebGL)...";
    btnOnnx.disabled = true;

  try {
    const ort = globalThis.ort || window.ort;
    console.log("[ONNX] ort type:", typeof ort, "| backends:", ort?.env?.webgl ? "webgl available" : "no webgl");
    if (!ort) throw new Error("ort global not found.");

    const t0 = performance.now();

    const resp = await fetch("identity.onnx");
    const modelBytes = new Uint8Array(await resp.arrayBuffer());

    const data = new Float32Array([1.0, 2.0, 3.0, 4.0]);
    const tensor = new ort.Tensor("float32", data, [1, 4]);

    console.log("[ONNX] Creating session with", modelBytes.length, "bytes...");
    const session = await ort.InferenceSession.create(modelBytes, {
      executionProviders: ["webgl"],
      graphOptimizationLevel: "all",
    });
    console.log("[ONNX] Session created, inputs:", session.inputNames);

    const outputs = await session.run({ [session.inputNames[0]]: tensor });
    const elapsed = (performance.now() - t0).toFixed(0);

    const outData = outputs[session.outputNames[0]].data;
    const match = outData[0] === 1.0 && outData[1] === 2.0 && outData[2] === 3.0 && outData[3] === 4.0;

    textEl.textContent = match ? "ONNX Runtime Web OK" : "Output mismatch";
    metaEl.textContent = `Identity test ${match ? "passed" : "FAILED"} · ${elapsed}ms · Backend: WebGL`;
    resultEl.classList.add("found");
    statusEl.textContent = `✓ ONNX Runtime Web works! (${elapsed}ms)`;
    btnOnnx.textContent = "ONNX ✓";
    btnOnnx.style.background = "#22c55e";
  } catch (e) {
    console.error("[ONNX] Error:", e.message, e);
    textEl.textContent = "ONNX failed";
    metaEl.textContent = e.message;
    resultEl.classList.add("found");
    statusEl.textContent = "✗ " + e.message;
    btnOnnx.textContent = "ONNX ✗";
    btnOnnx.style.background = "#ef4444";
  } finally {
    btnOnnx.disabled = false;
    setTimeout(() => resultEl.classList.remove("found"), 4000);
  }
});

start();
