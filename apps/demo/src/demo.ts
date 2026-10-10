import {
  createScanner,
  decode,
  FORMATS,
  type Scanner,
  type ScannerOptions,
  type TrackedResult,
} from "@qhago/scanner";
import { applyFocus, trackOf } from "./camopts";
import { dlog, mountDebug } from "./debug";
import "./scan-ui.css";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>("video");
const overlay = $<HTMLCanvasElement>("overlay");
let scanner: Scanner | null = null;
const live = new Map<number, { r: TrackedResult; at: number }>();
const laser = $<HTMLElement>("laser");
const focusSel = $<HTMLSelectElement>("focus");
const setFocus = async () => {
  const msg = await applyFocus(trackOf(video), focusSel.value, $("dist"), $("dist-wrap"));
  if (msg) $("stats").textContent = msg;
};
const dbg = mountDebug($("dbg"), {
  video: () => (scanner ? video : null),
  info: () => ({
    ai: $<HTMLSelectElement>("ai").value,
    focus: focusSel.value,
    roi: $<HTMLInputElement>("use-roi").checked,
    settings: trackOf(video)?.getSettings(),
  }),
  flash: () => document.querySelector<HTMLElement>(".stage"),
});
let lastFrameLog = 0;

async function build(): Promise<Scanner> {
  const ai = $<HTMLSelectElement>("ai").value;
  const [w, h] = $<HTMLSelectElement>("res").value.split("x").map(Number) as [number, number];
  let extra: Partial<ScannerOptions> = {};
  if (ai !== "off") {
    $("stats").textContent = "cargando IA…";
    const { aiDetector, aiWorker } = await import("@qhago/ai");
    extra = {
      workerFactory: aiWorker,
      plugins: [aiDetector({ when: ai as "fallback" | "always" })],
    };
  }
  dlog("open", {
    ai,
    resolution: [w, h],
    focus: focusSel.value,
    roi: $<HTMLInputElement>("use-roi").checked,
  });
  const s = createScanner({
    ...extra,
    video,
    formats: $<HTMLInputElement>("all-formats").checked ? FORMATS : undefined,
    roi: $<HTMLInputElement>("use-roi").checked
      ? { x: 0.1, y: 0.3, width: 0.8, height: 0.4 }
      : "full",
    camera: { deviceId: $<HTMLSelectElement>("camera").value || undefined, resolution: [w, h] },
    frameStats: true,
  });
  s.on("detect", ({ result }) => {
    live.set(result.trackId, { r: result, at: performance.now() });
    const li = document.createElement("li");
    li.textContent = `${result.format} · ${result.text} · track ${result.trackId} · ${result.votes} voto(s)`;
    $("results").prepend(li);
    navigator.vibrate?.(40);
    dlog("detect", { format: result.format, text: result.text, votes: result.votes });
    dbg.noteDetect(result);
    laser.classList.add("hit");
    setTimeout(() => laser.classList.remove("hit"), 400);
  });
  s.on("candidate", ({ result }) => {
    live.set(result.trackId, { r: result, at: performance.now() });
    dlog("candidate", { format: result.format, text: result.text });
  });
  s.on("track", ({ result }) => live.set(result.trackId, { r: result, at: performance.now() }));
  s.on("lost", ({ trackId }) => live.delete(trackId));
  s.on("frame", (e) => {
    const now = performance.now();
    if (now - lastFrameLog > 1000) {
      lastFrameLog = now;
      dlog("frame", {
        route: s.route,
        fps: e.fps,
        ms: e.ms,
        passes: e.passes,
        settings: trackOf(video)?.getSettings(),
      });
    }
    const st = trackOf(video)?.getSettings() as
      | (MediaTrackSettings & { focusMode?: string })
      | undefined;
    $("stats").textContent =
      `${st ? `${st.width}×${st.height} · enfoque ${st.focusMode ?? "?"} · ` : ""}${s.route} · ${e.fps.toFixed(1)} fps · ${e.ms.toFixed(1)} ms/frame · ${e.passes.join(",")}`;
  });
  s.on("error", ({ error }) => {
    $("stats").textContent = `Error ${error.code}: ${error.message}`;
    dlog("scanner-error", { code: error.code, message: error.message });
  });
  s.on("state", ({ state }) => {
    dlog("state", { state });
    laser.hidden = state !== "scanning" || !$<HTMLInputElement>("use-laser").checked;
    $<HTMLButtonElement>("pause").disabled = state !== "scanning" && state !== "paused";
    $<HTMLButtonElement>("stop").disabled = state !== "scanning" && state !== "paused";
    $("pause").textContent = state === "paused" ? "▶ Reanudar" : "⏸ Pausa";
  });
  return s;
}

/** Dibuja las esquinas en coordenadas del vídeo sobre un canvas con object-fit: cover. */
function draw() {
  const ctx = overlay.getContext("2d");
  if (ctx && video.videoWidth) {
    overlay.width = overlay.clientWidth * devicePixelRatio;
    overlay.height = overlay.clientHeight * devicePixelRatio;
    const s = Math.max(overlay.width / video.videoWidth, overlay.height / video.videoHeight);
    const ox = (overlay.width - video.videoWidth * s) / 2;
    const oy = (overlay.height - video.videoHeight * s) / 2;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.lineWidth = 3 * devicePixelRatio;
    const now = performance.now();
    for (const [id, { r, at }] of live) {
      if (now - at > 800) {
        live.delete(id);
        continue;
      }
      ctx.strokeStyle = "#2f2";
      ctx.beginPath();
      r.cornerPoints.forEach((p, i) => {
        const x = ox + p.x * s;
        const y = oy + p.y * s;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
    }
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

$("start").onclick = async () => {
  scanner?.destroy();
  scanner = await build();
  $("roi").hidden = !$<HTMLInputElement>("use-roi").checked;
  await scanner.start();
  await setFocus();
  const cams = await scanner.listCameras();
  const sel = $<HTMLSelectElement>("camera");
  const current = (video.srcObject as MediaStream | null)
    ?.getVideoTracks()[0]
    ?.getSettings().deviceId;
  sel.innerHTML = cams
    .map(
      (c) =>
        `<option value="${c.deviceId}" ${c.deviceId === current ? "selected" : ""}>${c.label || c.deviceId.slice(0, 8)}</option>`,
    )
    .join("");
  const caps = scanner.getCapabilities();
  $<HTMLButtonElement>("torch").disabled = !caps.torch;
  const zoom = $<HTMLInputElement>("zoom");
  zoom.disabled = !caps.zoom;
  if (caps.zoom)
    Object.assign(zoom, {
      min: String(caps.zoom.min),
      max: String(caps.zoom.max),
      step: String(caps.zoom.step),
    });
};
$("pause").onclick = () => (scanner?.state === "paused" ? scanner.resume() : scanner?.pause());
$("stop").onclick = () => scanner?.stop();
let torch = false;
$("torch").onclick = async () => {
  torch = !torch;
  await scanner?.setTorch(torch);
};
$<HTMLInputElement>("zoom").oninput = (e) =>
  scanner?.setZoom(Number((e.target as HTMLInputElement).value));
$<HTMLSelectElement>("camera").onchange = (e) =>
  scanner?.switchCamera((e.target as HTMLSelectElement).value);

$<HTMLInputElement>("file").onchange = async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const t = performance.now();
  const r = await decode(f, { formats: FORMATS, strategy: "thorough" });
  $("out").textContent = `${(performance.now() - t).toFixed(0)} ms\n${JSON.stringify(
    r.map(({ bytes: _b, ...x }) => x),
    null,
    2,
  )}`;
};

focusSel.onchange = () => void setFocus();
$<HTMLInputElement>("dist").oninput = () => void setFocus();
$<HTMLInputElement>("use-laser").onchange = (e) => {
  laser.hidden = !(e.target as HTMLInputElement).checked || scanner?.state !== "scanning";
};
