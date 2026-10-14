// Demo pública de @qhago/scanner (+ @qhago/ai opcional): estado de la UI y eventos.
import { isScanError, type ScanErrorCode, type Scanner, type ScannerState } from "@qhago/scanner";
import { Overlay } from "./overlay";
import { Results } from "./results";
import {
  type AiMode,
  aiBackendLabel,
  buildScanner,
  decodeFile,
  type FormatPreset,
  loadAi,
  PRESETS,
  type ScanSettings,
} from "./scanner";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const video = $<HTMLVideoElement>("video");
const status = $<HTMLParagraphElement>("status");
const startBtn = $<HTMLButtonElement>("start");
const stopBtn = $<HTMLButtonElement>("stop");
const cameraRow = $<HTMLDivElement>("camera-row");
const cameraSel = $<HTMLSelectElement>("camera");
const torchBtn = $<HTMLButtonElement>("torch");
const zoomRow = $<HTMLDivElement>("zoom-row");
const zoomInput = $<HTMLInputElement>("zoom");
const formatsSel = $<HTMLSelectElement>("formats");
const aiToggle = $<HTMLInputElement>("ai");
const aiStatus = $<HTMLParagraphElement>("ai-status");

const overlay = new Overlay($<HTMLCanvasElement>("overlay"), video);
const results = new Results($<HTMLOListElement>("results"), $("empty"));

// ?ai=always: la IA corre en cada frame aunque el motor clásico lea (diagnóstico y e2e).
const aiWhen: Exclude<AiMode, "off"> =
  new URLSearchParams(location.search).get("ai") === "always" ? "always" : "fallback";

let scanner: Scanner | null = null;
let deviceId: string | undefined;

function settings(): ScanSettings {
  return {
    formats: PRESETS[formatsSel.value as FormatPreset] ?? PRESETS.default,
    ai: aiToggle.checked ? aiWhen : "off",
    ...(deviceId ? { deviceId } : {}),
  };
}

// ---------- Estado ----------
const STATE_TEXT: Record<ScannerState, string> = {
  idle: "Pulsa «Iniciar cámara» para escanear.",
  starting: "Pidiendo permiso para usar la cámara…",
  scanning: "Escaneando: apunta a un código.",
  paused: "En pausa.",
  stopped: "Cámara detenida.",
  destroyed: "Cámara detenida.",
  error: "No se pudo usar la cámara.",
};

function setState(state: ScannerState): void {
  document.body.dataset.state = state;
  status.textContent = STATE_TEXT[state];
  const active = state === "scanning" || state === "paused" || state === "starting";
  startBtn.hidden = active;
  stopBtn.hidden = !active;
  if (state === "scanning") overlay.start();
  if (!active) {
    overlay.stop();
    cameraRow.hidden = zoomRow.hidden = true;
  }
}

// ---------- Errores ----------
const HELP: Partial<Record<ScanErrorCode, string>> = {
  PERMISSION_DENIED:
    "Has bloqueado el acceso a la cámara. Actívalo en los ajustes del sitio (icono junto a la dirección) y vuelve a intentarlo. También puedes leer desde una foto.",
  NO_CAMERA: "No se encontró ninguna cámara. Puedes leer desde una foto.",
  CAMERA_IN_USE: "Otra aplicación o pestaña está usando la cámara. Ciérrala y vuelve a intentarlo.",
  INSECURE_CONTEXT: "La cámara solo funciona en páginas HTTPS (o en localhost).",
  ENGINE_LOAD_FAILED: "No se pudo cargar el motor. Comprueba tu conexión y recarga la página.",
  INVALID_INPUT: "No se pudo abrir la imagen. Prueba con otra foto (JPEG o PNG).",
};

const errorBox = $<HTMLElement>("error");

function showError(e: unknown): void {
  errorBox.hidden = false;
  const link = $<HTMLAnchorElement>("error-link");
  if (isScanError(e)) {
    $("error-code").textContent = e.code;
    $("error-message").textContent = e.message;
    $("error-help").textContent = HELP[e.code] ?? "";
    link.href = e.docsUrl;
    link.hidden = false;
  } else {
    $("error-code").textContent = "Error";
    $("error-message").textContent = e instanceof Error ? e.message : String(e);
    $("error-help").textContent = "";
    link.hidden = true;
  }
  console.warn(e);
}

function hideError(): void {
  errorBox.hidden = true;
}

// ---------- Cámara ----------
async function startCamera(): Promise<void> {
  hideError();
  setState("starting");
  const s = settings();
  if (s.ai !== "off") setAiStatus("cargando");
  let sc: Scanner;
  try {
    sc = await buildScanner(video, s);
  } catch (e) {
    setState("error");
    showError(e);
    return;
  }
  scanner = sc;
  sc.on("state", (e) => setState(e.state));
  sc.on("error", (e) => showError(e.error));
  sc.on("detect", (e) => {
    overlay.update(e.result, "detect");
    if (results.add(e.result, "cámara")) navigator.vibrate?.(40);
  });
  sc.on("track", (e) => overlay.update(e.result, "detect"));
  sc.on("candidate", (e) => overlay.update(e.result, "candidate"));
  sc.on("lost", (e) => overlay.remove(e.trackId));
  try {
    await sc.start();
  } catch {
    return; // ya notificado por el evento "error"
  }
  if (s.ai !== "off") setAiStatus("activa");
  await setupCameraControls(sc);
}

async function stopCamera(): Promise<void> {
  const sc = scanner;
  scanner = null;
  sc?.destroy();
  setState("stopped");
}

/** Recrea el scanner con las opciones nuevas (formatos, IA) si la cámara está en marcha. */
async function restartIfRunning(): Promise<void> {
  if (!scanner) return;
  await stopCamera();
  await startCamera();
}

async function setupCameraControls(sc: Scanner): Promise<void> {
  const cams = await sc.listCameras().catch(() => []);
  cameraSel.replaceChildren(
    ...cams.map((c, i) => new Option(c.label || `Cámara ${i + 1}`, c.deviceId)),
  );
  const current = (video.srcObject as MediaStream | null)?.getVideoTracks()[0]?.getSettings();
  if (current?.deviceId) cameraSel.value = current.deviceId;
  const caps = sc.getCapabilities();
  torchBtn.hidden = !caps.torch;
  torchBtn.setAttribute("aria-pressed", "false");
  cameraRow.hidden = cams.length < 2 && !caps.torch;
  cameraSel.parentElement?.toggleAttribute("hidden", cams.length < 2);
  zoomRow.hidden = !caps.zoom;
  if (caps.zoom) {
    zoomInput.min = String(caps.zoom.min);
    zoomInput.max = String(caps.zoom.max);
    zoomInput.step = String(caps.zoom.step);
    zoomInput.value = String(caps.zoom.min);
  }
}

startBtn.addEventListener("click", () => void startCamera());
stopBtn.addEventListener("click", () => void stopCamera());

cameraSel.addEventListener("change", async () => {
  if (!scanner) return;
  deviceId = cameraSel.value;
  try {
    await scanner.switchCamera(deviceId);
    await setupCameraControls(scanner);
  } catch (e) {
    showError(e);
  }
});

torchBtn.addEventListener("click", async () => {
  if (!scanner) return;
  const on = torchBtn.getAttribute("aria-pressed") !== "true";
  try {
    await scanner.setTorch(on);
    torchBtn.setAttribute("aria-pressed", String(on));
  } catch (e) {
    showError(e);
  }
});

zoomInput.addEventListener("input", () => {
  scanner?.setZoom(Number(zoomInput.value)).catch(showError);
});

formatsSel.addEventListener("change", () => void restartIfRunning());

// ---------- IA ----------
function setAiStatus(phase: "cargando" | "activa" | "off"): void {
  aiStatus.hidden = phase === "off";
  aiStatus.textContent =
    phase === "cargando"
      ? "IA: cargando el modelo (~4 MB la primera vez)…"
      : `IA activa (${aiWhen === "always" ? "en cada frame" : "solo si no se lee"}) · ${aiBackendLabel()}`;
}

aiToggle.addEventListener("change", async () => {
  if (!aiToggle.checked) {
    setAiStatus("off");
  } else if (!scanner) {
    // Precarga el módulo (no el modelo: se descarga al primer uso dentro del worker).
    setAiStatus("cargando");
    try {
      await loadAi();
      setAiStatus("activa");
    } catch (e) {
      aiToggle.checked = false;
      setAiStatus("off");
      showError(e);
    }
    return;
  }
  await restartIfRunning();
});

// ---------- Archivo ----------
async function readImage(file: Blob, label: string): Promise<void> {
  hideError();
  const prev = status.textContent;
  status.textContent = "Leyendo la imagen…";
  const t0 = performance.now();
  try {
    const found = await decodeFile(file, settings());
    const ms = Math.round(performance.now() - t0);
    for (const r of found) results.add(r, `${label} · ${ms} ms`);
    status.textContent = found.length
      ? `${found.length} código(s) en ${ms} ms.`
      : `No se encontró ningún código (${ms} ms). Prueba con más luz o más cerca, o activa la IA.`;
  } catch (e) {
    status.textContent = prev;
    showError(e);
  }
}

for (const id of ["file", "photo"]) {
  const input = $<HTMLInputElement>(id);
  input.addEventListener("change", () => {
    const f = input.files?.[0];
    if (f) void readImage(f, "foto");
    input.value = "";
  });
}

$("sample").addEventListener("click", async () => {
  const res = await fetch(new URL("fixture.png", document.baseURI));
  await readImage(await res.blob(), "ejemplo");
});

$("clear").addEventListener("click", () => results.clear());

// ---------- Pie ----------
$("versions").textContent = Object.entries(__VERSIONS__)
  .map(([name, v]) => `${name} ${v}`)
  .join(" · ");
