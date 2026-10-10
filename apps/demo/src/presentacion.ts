// Presentación: navegación por teclado/táctil + diapositiva en vivo con la librería real.
import { type DecodeStrategy, decode } from "@qhago/scanner";
import type { QhagoScannerElement } from "@qhago/scanner/ui";
import { applyFocus, trackOf } from "./camopts";
import { dlog, mountDebug } from "./debug";
import "./scan-ui.css";

const slides = [...document.querySelectorAll<HTMLElement>("#deck > section")];
const progress = document.getElementById("progress") as HTMLElement;
const toc = document.getElementById("toc") as HTMLElement;
let current = 0;

function show(i: number): void {
  current = Math.max(0, Math.min(slides.length - 1, i));
  for (const [k, s] of slides.entries()) s.classList.toggle("active", k === current);
  progress.style.width = `${((current + 1) / slides.length) * 100}%`;
  history.replaceState(null, "", `#${current + 1}`);
}

toc.innerHTML = slides
  .map(
    (s, i) =>
      `<a href="#${i + 1}" data-i="${i}">${i + 1}. ${s.querySelector("h1, h2")?.textContent ?? ""}</a>`,
  )
  .join("");
toc.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest("a");
  if (!a) return;
  e.preventDefault();
  toc.hidden = true;
  show(Number(a.dataset.i));
});

document.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).closest("input, select, textarea, qhago-scanner")) return;
  if (["ArrowRight", "PageDown", " "].includes(e.key)) show(current + 1);
  else if (["ArrowLeft", "PageUp"].includes(e.key)) show(current - 1);
  else if (e.key === "Home") show(0);
  else if (e.key === "End") show(slides.length - 1);
  else if (e.key.toLowerCase() === "o") toc.hidden = !toc.hidden;
  else if (e.key.toLowerCase() === "f")
    void (document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen());
  else if (e.key === "Escape") toc.hidden = true;
  else return;
  e.preventDefault();
});
let touchX = 0;
document.addEventListener("touchstart", (e) => (touchX = e.touches[0]?.clientX ?? 0), {
  passive: true,
});
document.addEventListener("touchend", (e) => {
  const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX;
  if (Math.abs(dx) > 60) show(current + (dx < 0 ? 1 : -1));
});
show(Number(location.hash.slice(1)) - 1 || 0);

// ---- Diapositiva en vivo ----
const out = document.getElementById("out") as HTMLElement;
const drop = document.getElementById("drop") as HTMLElement;
const strategy = document.getElementById("strategy") as HTMLSelectElement;

async function run(file: Blob): Promise<void> {
  out.textContent = "leyendo…";
  const t0 = performance.now();
  try {
    const rs = await decode(file, {
      strategy: strategy.value as DecodeStrategy,
      formats: [
        "aztec",
        "codabar",
        "code_39",
        "code_93",
        "code_128",
        "data_matrix",
        "ean_8",
        "ean_13",
        "itf",
        "pdf417",
        "qr_code",
        "upc_a",
        "upc_e",
      ],
    });
    const ms = (performance.now() - t0).toFixed(0);
    dlog("decode", {
      strategy: strategy.value,
      ms: Number(ms),
      results: rs.map((r) => ({ format: r.format, text: r.text, confidence: r.confidence })),
    });
    out.textContent = rs.length
      ? `${rs.length} código(s) en ${ms} ms\n\n${rs.map((r) => `${r.format}  ${r.text}  (confianza ${r.confidence.toFixed(2)})`).join("\n")}`
      : `Sin códigos (${ms} ms). Prueba strategy "thorough".`;
  } catch (e) {
    out.textContent = `${(e as { code?: string }).code ?? "Error"}: ${(e as Error).message}`;
    dlog("decode-error", { code: (e as { code?: string }).code, message: (e as Error).message });
  }
}

(document.getElementById("file") as HTMLInputElement).addEventListener("change", (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) void run(f);
});
drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.classList.add("over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  const f = e.dataTransfer?.files[0];
  if (f) void run(f);
});

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const camStats = $<HTMLElement>("cam-stats");
const distWrap = $<HTMLElement>("dist-wrap");
const dist = $<HTMLInputElement>("dist");
const laser = $<HTMLElement>("laser");
const camVideo = () => camEl?.scanner?.video;
const camTrack = (el: QhagoScannerElement) => trackOf(el.scanner?.video);
const focusSel = $<HTMLSelectElement>("focus");
const setFocus = async (el: QhagoScannerElement) => {
  const msg = await applyFocus(camTrack(el), focusSel.value, dist, distWrap);
  if (msg) camStats.textContent = msg;
};

let camEl: QhagoScannerElement | null = null;
const dbg = mountDebug($<HTMLElement>("dbg"), {
  video: camVideo,
  info: () => ({
    ai: $<HTMLSelectElement>("ai").value,
    focus: focusSel.value,
    settings: trackOf(camVideo())?.getSettings(),
  }),
  flash: () => $<HTMLElement>("cam-slot"),
});

async function openCam(): Promise<void> {
  const slot = $<HTMLElement>("cam-slot");
  const ai = $<HTMLSelectElement>("ai").value;
  const [w, h] = $<HTMLSelectElement>("res").value.split("x").map(Number) as [number, number];
  await import("@qhago/scanner/ui");
  const el = document.createElement("qhago-scanner");
  el.setAttribute("formats", "ean_13,ean_8,upc_a,code_128,qr_code,data_matrix");
  el.setAttribute("torch-button", "");
  el.setAttribute("switch-camera-button", "");
  el.setAttribute("beep", "");
  el.setAttribute("lang", "es");
  el.options = { camera: { resolution: [w, h] }, frameStats: true };
  if (ai !== "off") {
    camStats.textContent = "cargando IA…";
    const { aiDetector, aiWorker } = await import("@qhago/ai");
    el.options = {
      ...el.options,
      workerFactory: aiWorker,
      plugins: [aiDetector({ when: ai as "fallback" | "always" })],
    };
  }
  dlog("open", { ai, resolution: [w, h], focus: focusSel.value });
  let t0 = performance.now();
  let lastLog = 0;
  let fps = 0;
  let ms = 0;
  let passes: readonly string[] = [];
  let last = "";
  const render = () => {
    const track = el.isConnected ? camTrack(el) : undefined;
    const st = track?.getSettings() as (MediaTrackSettings & { focusMode?: string }) | undefined;
    camStats.textContent =
      `${st ? `${st.width}×${st.height} · enfoque ${st.focusMode ?? "?"}` : "…"} · IA ${ai}\n` +
      `${fps.toFixed(1)} fps · ${ms.toFixed(0)} ms/frame · ${passes.join(" ") || "—"}` +
      (last ? `\n${last}` : "");
  };
  el.addEventListener("statechange", (ev) => {
    const state = (ev as CustomEvent<string>).detail;
    dlog("state", { state });
    laser.hidden = state !== "scanning";
    if (state !== "scanning") return;
    t0 = performance.now();
    const sc = el.scanner;
    if (!sc) return;
    sc.on("candidate", (e) => dlog("candidate", { format: e.result.format, text: e.result.text }));
    sc.on("error", (e) => dlog("scanner-error", { code: e.error.code, message: e.error.message }));
    sc.on("frame", (f) => {
      fps = f.fps;
      ms = f.ms;
      passes = f.passes;
      const now = performance.now();
      if (now - lastLog > 1000) {
        lastLog = now;
        dlog("frame", {
          fps: f.fps,
          ms: f.ms,
          passes: f.passes,
          settings: camTrack(el)?.getSettings(),
        });
      }
      render();
    });
    void setFocus(el).then(render);
  });
  el.addEventListener("error", (ev) =>
    dlog("element-error", {
      message: String((ev as unknown as CustomEvent<{ message?: string }>).detail?.message ?? ""),
    }),
  );
  el.addEventListener("detect", (ev) => {
    const r = (ev as CustomEvent<{ format: string; text: string }>).detail;
    last = `detectado en ${((performance.now() - t0) / 1000).toFixed(1)} s`;
    dlog("detect", { format: r.format, text: r.text, afterMs: Math.round(performance.now() - t0) });
    dbg.noteDetect(r);
    laser.classList.add("hit");
    setTimeout(() => laser.classList.remove("hit"), 400);
    t0 = performance.now();
    out.textContent = `cámara → ${r.format}  ${r.text}`;
    render();
  });
  slot.replaceChildren(el, laser);
  camEl = el;
}

function closeCam(): void {
  dlog("close");
  laser.hidden = true;
  $<HTMLElement>("cam-slot").replaceChildren(laser);
  camEl = null;
  distWrap.hidden = true;
}

$<HTMLButtonElement>("cam").addEventListener("click", () => {
  if (camEl) closeCam();
  else void openCam();
});
// Cambiar IA o resolución reabre la cámara; el enfoque se aplica en caliente.
for (const id of ["ai", "res"])
  $<HTMLSelectElement>(id).addEventListener("change", () => {
    if (camEl) {
      closeCam();
      void openCam();
    }
  });
focusSel.addEventListener("change", () => camEl && void setFocus(camEl));
dist.addEventListener("input", () => camEl && void setFocus(camEl));
