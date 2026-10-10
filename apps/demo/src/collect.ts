// Herramienta de captura y etiquetado del dataset real (F1.2, modo esquinas F5.2).
// Escribe muestras compatibles con bench/dataset/manifest.schema.json en una carpeta local
// (File System Access API) o, si no está disponible, como descargas.
import { type BarcodeFormat, decode, FORMATS } from "@qhago/scanner";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import zxingWasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

type Corners = [number, number][];
interface Code {
  format: BarcodeFormat;
  text: string;
  corners?: Corners;
  source: "qhago" | "zxing-wasm" | "ambos" | "referencia" | "manual";
}
interface Capture {
  kind: "image" | "video";
  blob: Blob;
  width: number;
  height: number;
  fps?: number;
  bitmap?: ImageBitmap;
}

const SCENARIOS = [
  "normal",
  "low_light",
  "motion_blur",
  "defocus",
  "perspective",
  "curved",
  "small",
  "multi",
  "glare",
  "screen",
  "damaged",
  "inverted",
  "dense_2d",
];
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>("video");
const preview = $<HTMLCanvasElement>("preview");
const status = (m: string) => {
  $("status").textContent = m;
};

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith(".wasm") ? zxingWasmUrl : prefix + path,
  },
});

let stream: MediaStream | null = null;
let capture: Capture | null = null;
let codes: Code[] = [];
let dir: FileSystemDirectoryHandle | null = null;
const refByObject = new Map<string, Code[]>();
let cornerTarget: number | null = null;
let cornerPts: Corners = [];

// ---------- UI estática ----------
for (const s of SCENARIOS) {
  const l = document.createElement("label");
  l.innerHTML = `<input type="checkbox" value="${s}" /> ${s}`;
  $("scenarios").append(l);
}
$<HTMLInputElement>("device").value =
  navigator.userAgent.match(/\(([^)]+)\)/)?.[1]?.slice(0, 40) ?? "desconocido";
const newObject = () => {
  $<HTMLInputElement>("object").value = `obj-${Date.now().toString(36)}`;
};
newObject();
$("new-object").onclick = newObject;

// ---------- Cámara ----------
async function listCameras() {
  const sel = $<HTMLSelectElement>("camera");
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter(
    (d) => d.kind === "videoinput",
  );
  sel.innerHTML = devs
    .map((d, i) => `<option value="${d.deviceId}">${d.label || `Cámara ${i + 1}`}</option>`)
    .join("");
}

$("start").onclick = async () => {
  stream?.getTracks().forEach((t) => {
    t.stop();
  });
  const deviceId = $<HTMLSelectElement>("camera").value;
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      : { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  });
  video.srcObject = stream;
  await video.play();
  await listCameras();
  for (const b of ["shot-ref", "shot", "rec"]) $<HTMLButtonElement>(b).disabled = false;
  status(`Cámara ${video.videoWidth}×${video.videoHeight}`);
};

async function grabFrame(): Promise<Capture> {
  const c = new OffscreenCanvas(video.videoWidth, video.videoHeight);
  c.getContext("2d")?.drawImage(video, 0, 0);
  const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.95 });
  return {
    kind: "image",
    blob,
    width: c.width,
    height: c.height,
    bitmap: await createImageBitmap(c),
  };
}

// ---------- Prelectura con 2 motores ----------
async function preread(bmp: ImageBitmap): Promise<Code[]> {
  const [q, z] = await Promise.all([
    decode(bmp, { formats: FORMATS, strategy: "thorough" }).catch(() => []),
    readBarcodes(bmp as unknown as ImageData, { tryHarder: true, textMode: "Plain" }).catch(
      () => [],
    ),
  ]);
  const out: Code[] = q.map((r) => ({
    format: r.format,
    text: r.text,
    corners: r.cornerPoints.map((p) => [Math.round(p.x), Math.round(p.y)]) as Corners,
    source: "qhago" as const,
  }));
  for (const b of z.filter((x) => x.isValid)) {
    const hit = out.find((c) => c.text === b.text);
    if (hit) hit.source = "ambos";
    else out.push({ format: "qr_code", text: b.text, source: "zxing-wasm" }); // formato a confirmar a mano
  }
  return out;
}

async function onCapture(kind: "ref" | "photo") {
  const object = $<HTMLInputElement>("object").value;
  capture = await grabFrame();
  draw();
  status("Leyendo…");
  if ($<HTMLInputElement>("negative").checked) {
    codes = [];
  } else {
    codes = await preread(capture.bitmap as ImageBitmap);
    if (kind === "ref" && codes.length)
      refByObject.set(
        object,
        codes.map((c) => ({ ...c, corners: undefined })),
      );
    if (!codes.length && refByObject.has(object)) {
      codes = (refByObject.get(object) ?? []).map((c) => ({ ...c, source: "referencia" as const }));
    }
  }
  renderCodes();
  $<HTMLButtonElement>("save").disabled = false;
  status(`${codes.length} código(s) propuestos — confirma o corrige`);
}
$("shot-ref").onclick = () => onCapture("ref");
$("shot").onclick = () => onCapture("photo");

// ---------- Vídeo ----------
let recorder: MediaRecorder | null = null;
$("rec").onclick = () => {
  if (recorder) {
    recorder.stop();
    return;
  }
  if (!stream) return;
  const mime =
    ["video/webm;codecs=vp9", "video/webm", "video/mp4"].find((m) =>
      MediaRecorder.isTypeSupported(m),
    ) ?? "";
  const chunks: Blob[] = [];
  recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  recorder.ondataavailable = (e) => chunks.push(e.data);
  const settings = stream.getVideoTracks()[0]?.getSettings();
  recorder.onstop = async () => {
    recorder = null;
    $("rec").textContent = "⏺ Vídeo";
    capture = {
      kind: "video",
      blob: new Blob(chunks, { type: mime }),
      width: settings?.width ?? 0,
      height: settings?.height ?? 0,
      fps: settings?.frameRate,
    };
    const object = $<HTMLInputElement>("object").value;
    codes = $<HTMLInputElement>("negative").checked
      ? []
      : (refByObject.get(object) ?? []).map((c) => ({ ...c, source: "referencia" as const }));
    renderCodes();
    $<HTMLButtonElement>("save").disabled = false;
    status(`Vídeo ${(capture.blob.size / 1e6).toFixed(1)} MB — etiqueta los códigos que aparecen`);
  };
  recorder.start();
  $("rec").textContent = "⏹ Parar";
  setTimeout(() => recorder?.state === "recording" && recorder.stop(), 10_000);
};

// ---------- Etiquetas ----------
function renderCodes() {
  const root = $("codes");
  root.innerHTML = "";
  codes.forEach((c, i) => {
    const row = document.createElement("div");
    row.className = `code ${c.source === "ambos" || c.source === "referencia" ? "agree" : c.source === "manual" ? "" : "disagree"}`;
    row.innerHTML = `<select>${FORMATS.map((f) => `<option ${f === c.format ? "selected" : ""}>${f}</option>`).join("")}</select>
      <input value="${c.text.replace(/"/g, "&quot;")}" title="fuente: ${c.source}" />
      <small>${c.source}${c.corners ? " · esquinas" : ""}</small><button aria-label="Quitar">✕</button>`;
    const [sel, inp, , rm] = [...row.children] as [
      HTMLSelectElement,
      HTMLInputElement,
      HTMLElement,
      HTMLButtonElement,
    ];
    sel.onchange = () => {
      c.format = sel.value as BarcodeFormat;
    };
    inp.oninput = () => {
      c.text = inp.value;
      c.source = "manual";
    };
    rm.onclick = () => {
      codes.splice(i, 1);
      renderCodes();
    };
    row.onclick = (e) => {
      if ((e.target as HTMLElement).tagName === "DIV") cornerTarget = i;
    };
    root.append(row);
  });
  draw();
}
$("add-code").onclick = () => {
  codes.push({ format: "ean_13", text: "", source: "manual" });
  renderCodes();
};

// ---------- Modo esquinas (F5.2) ----------
$("corners").onclick = () => {
  if (!codes.length) codes.push({ format: "qr_code", text: "", source: "manual" });
  cornerTarget = codes.length - 1;
  cornerPts = [];
  $("corner-hint").hidden = false;
};
preview.onclick = (e) => {
  if (cornerTarget === null || !capture?.bitmap) return;
  const r = preview.getBoundingClientRect();
  const sx = capture.width / r.width;
  const sy = capture.height / r.height;
  cornerPts.push([Math.round((e.clientX - r.left) * sx), Math.round((e.clientY - r.top) * sy)]);
  if (cornerPts.length === 4) {
    const c = codes[cornerTarget];
    if (c) c.corners = cornerPts;
    cornerTarget = null;
    $("corner-hint").hidden = true;
    renderCodes();
  }
  draw();
};

function draw() {
  const ctx = preview.getContext("2d");
  if (!ctx) return;
  if (!capture?.bitmap) {
    ctx.clearRect(0, 0, preview.width, preview.height);
    return;
  }
  preview.width = capture.width;
  preview.height = capture.height;
  ctx.drawImage(capture.bitmap, 0, 0);
  ctx.lineWidth = Math.max(2, capture.width / 300);
  for (const c of codes) {
    if (!c.corners) continue;
    ctx.strokeStyle = c.source === "ambos" ? "#2c2" : "#fa0";
    ctx.beginPath();
    for (const [k, [x, y]] of c.corners.entries()) {
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.fillStyle = "#f0f";
  for (const [x, y] of cornerPts) ctx.fillRect(x - 4, y - 4, 8, 8);
}

// ---------- Exportación ----------
async function sha256(b: Blob): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", await b.arrayBuffer());
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

$("pick-dir").onclick = async () => {
  const w = window as unknown as {
    showDirectoryPicker?: (o: object) => Promise<FileSystemDirectoryHandle>;
  };
  if (!w.showDirectoryPicker) {
    status("Este navegador no permite elegir carpeta: se usarán descargas.");
    return;
  }
  dir = await w.showDirectoryPicker({ mode: "readwrite" });
  status(`Carpeta: ${dir.name}`);
};

async function writeFile(path: string, data: Blob | string, append = false) {
  if (!dir) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
    a.download = path.replaceAll("/", "_");
    a.click();
    return;
  }
  const parts = path.split("/");
  let d = dir;
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
  const fh = await d.getFileHandle(parts.at(-1) as string, { create: true });
  const prev = append ? await (await fh.getFile()).text() : "";
  const w = await fh.createWritable();
  await w.write(append ? prev + (data as string) : data);
  await w.close();
}

$("save").onclick = async () => {
  if (!capture) return;
  if (!$<HTMLInputElement>("privacy").checked) {
    status("Marca la revisión de privacidad antes de guardar (ADR-12).");
    return;
  }
  const negative = $<HTMLInputElement>("negative").checked;
  const valid = codes.filter((c) => c.text.trim());
  if (!negative && !valid.length) {
    status("Sin códigos: etiqueta al menos uno o marca 'Negativa'.");
    return;
  }
  const scenarios = [
    ...document.querySelectorAll<HTMLInputElement>("#scenarios input:checked"),
  ].map((i) => i.value);
  const id = `real-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 8)}`;
  const ext =
    capture.kind === "video" ? (capture.blob.type.includes("mp4") ? "mp4" : "webm") : "jpg";
  const file = `${capture.kind === "video" ? "videos" : "images"}/${id}.${ext}`;
  const line = {
    id,
    file,
    sha256: await sha256(capture.blob),
    kind: capture.kind,
    codes: negative
      ? []
      : valid.map(({ format, text, corners }) =>
          corners ? { format, text, corners } : { format, text },
        ),
    complete: negative || $<HTMLInputElement>("complete").checked,
    scenarios: negative ? ["negative"] : scenarios.length ? scenarios : ["normal"],
    device: $<HTMLInputElement>("device").value,
    resolution: [capture.width, capture.height],
    ...(capture.fps ? { fps: capture.fps } : {}),
    source: "own-capture",
    license: $<HTMLInputElement>("license").value || "own",
    object: $<HTMLInputElement>("object").value,
    split: "dev", // el split dev/test se asigna después por objeto físico (F1.3)
    privacyReviewed: true,
  };
  await writeFile(file, capture.blob);
  await writeFile("manifest.jsonl", `${JSON.stringify(line)}\n`, true);
  status(`Guardado ${id}`);
  $<HTMLInputElement>("privacy").checked = false;
};
