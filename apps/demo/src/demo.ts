import { createScanner, decode, FORMATS, type Scanner, type TrackedResult } from "@qhago/scanner";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>("video");
const overlay = $<HTMLCanvasElement>("overlay");
let scanner: Scanner | null = null;
const live = new Map<number, { r: TrackedResult; at: number }>();

function build(): Scanner {
  const s = createScanner({
    video,
    formats: $<HTMLInputElement>("all-formats").checked ? FORMATS : undefined,
    roi: $<HTMLInputElement>("use-roi").checked
      ? { x: 0.1, y: 0.3, width: 0.8, height: 0.4 }
      : "full",
    camera: { deviceId: $<HTMLSelectElement>("camera").value || undefined },
    frameStats: true,
  });
  s.on("detect", ({ result }) => {
    live.set(result.trackId, { r: result, at: performance.now() });
    const li = document.createElement("li");
    li.textContent = `${result.format} · ${result.text} · track ${result.trackId} · ${result.votes} voto(s)`;
    $("results").prepend(li);
    navigator.vibrate?.(40);
  });
  s.on("candidate", ({ result }) => live.set(result.trackId, { r: result, at: performance.now() }));
  s.on("track", ({ result }) => live.set(result.trackId, { r: result, at: performance.now() }));
  s.on("lost", ({ trackId }) => live.delete(trackId));
  s.on("frame", (e) => {
    $("stats").textContent =
      `${s.route} · ${e.fps.toFixed(1)} fps · ${e.ms.toFixed(1)} ms/frame · ${e.passes.join(",")}`;
  });
  s.on("error", ({ error }) => {
    $("stats").textContent = `Error ${error.code}: ${error.message}`;
  });
  s.on("state", ({ state }) => {
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
  scanner = build();
  $("roi").hidden = !$<HTMLInputElement>("use-roi").checked;
  await scanner.start();
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
