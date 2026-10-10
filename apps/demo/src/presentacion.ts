// Presentación: navegación por teclado/táctil + diapositiva en vivo con la librería real.
import { type DecodeStrategy, decode } from "@qhago/scanner";
import type { QhagoScannerElement } from "@qhago/scanner/ui";
import { captureFrame, debugOn, debugStats, debugSummary, dlog } from "./debug";

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
type FocusCaps = MediaTrackCapabilities & {
  focusMode?: string[];
  focusDistance?: { min: number; max: number; step?: number };
};

function camTrack(el: QhagoScannerElement): MediaStreamTrack | undefined {
  return (el.scanner?.video?.srcObject as MediaStream | null)?.getVideoTracks()[0];
}

/** Aplica el modo de enfoque elegido (el scanner pone "continuous" al arrancar si existe). */
async function applyFocus(el: QhagoScannerElement): Promise<void> {
  const track = camTrack(el);
  const mode = $<HTMLSelectElement>("focus").value;
  if (!track || mode === "device") return;
  const caps = (track.getCapabilities?.() ?? {}) as FocusCaps;
  const fd = caps.focusDistance;
  distWrap.hidden = mode !== "manual" || !fd;
  if (!caps.focusMode?.includes(mode)) {
    camStats.textContent = `enfoque "${mode}" no soportado (modos: ${caps.focusMode?.join(", ") || "ninguno"})`;
    return;
  }
  dlog("capabilities", {
    caps: caps as unknown as Record<string, unknown>,
    settings: track.getSettings(),
  });
  const c: Record<string, unknown> = { focusMode: mode };
  if (mode === "manual" && fd) {
    Object.assign(dist, { min: fd.min, max: fd.max, step: fd.step ?? 0.01 });
    if (!dist.dataset.init) {
      dist.value = String(fd.min + (fd.max - fd.min) * 0.1);
      dist.dataset.init = "1";
    }
    c.focusDistance = Number(dist.value);
  }
  dlog("focus", c);
  await track.applyConstraints({ advanced: [c] } as MediaTrackConstraints).catch((e) => {
    dlog("focus-error", { message: (e as Error).message });
    camStats.textContent = `no se pudo aplicar el enfoque: ${(e as Error).message}`;
  });
}

let camEl: QhagoScannerElement | null = null;

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
  dlog("open", { ai, resolution: [w, h], focus: $<HTMLSelectElement>("focus").value });
  let t0 = performance.now();
  let lastLog = 0;
  let lastShot = 0;
  let fps = 0;
  let ms = 0;
  let passes: readonly string[] = [];
  let last = "";
  const render = () => {
    const track = el.isConnected ? camTrack(el) : undefined;
    const st = track?.getSettings() as (MediaTrackSettings & { focusMode?: string }) | undefined;
    if (debugOn) $<HTMLElement>("dbg-n").textContent = debugSummary();
    camStats.textContent =
      `${st ? `${st.width}×${st.height} · enfoque ${st.focusMode ?? "?"}` : "…"} · IA ${ai}\n` +
      `${fps.toFixed(1)} fps · ${ms.toFixed(0)} ms/frame · ${passes.join(" ") || "—"}` +
      (last ? `\n${last}` : "");
  };
  el.addEventListener("statechange", (ev) => {
    dlog("state", { state: (ev as CustomEvent<string>).detail });
    if ((ev as CustomEvent<string>).detail !== "scanning") return;
    t0 = performance.now();
    void applyFocus(el).then(() => {
      const sc = el.scanner;
      if (!sc) return;
      sc.on("candidate", (e) =>
        dlog("candidate", { format: e.result.format, text: e.result.text }),
      );
      sc.on("error", (e) =>
        dlog("scanner-error", { code: e.error.code, message: e.error.message }),
      );
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
        // Sin lectura: un fotograma cada 1,5 s para reproducir el fallo en el banco de pruebas.
        if ($<HTMLInputElement>("auto-shot").checked && now - lastShot > 1500 && now - t0 > 1500) {
          lastShot = now;
          void captureFrame(sc.video, "miss", {
            ai,
            fps: f.fps,
            ms: f.ms,
            passes: f.passes,
            sinceDetectMs: Math.round(now - t0),
          });
        }
        render();
      });
      render();
    });
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
    void captureFrame(el.scanner?.video, "detect", { ai, format: r.format, text: r.text });
    t0 = performance.now();
    out.textContent = `cámara → ${r.format}  ${r.text}`;
    render();
  });
  slot.replaceChildren(el);
  camEl = el;
}

function closeCam(): void {
  dlog("close");
  $<HTMLElement>("cam-slot").replaceChildren();
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
$<HTMLSelectElement>("focus").addEventListener("change", () => camEl && void applyFocus(camEl));
dist.addEventListener("input", () => camEl && void applyFocus(camEl));

// ---- Modo depuración ----
if (debugOn) {
  const dbg = $<HTMLElement>("dbg");
  dbg.hidden = false;
  debugStats.onChange = () => ($<HTMLElement>("dbg-n").textContent = debugSummary());
  debugStats.onChange();
  $<HTMLButtonElement>("snap").addEventListener("click", () => {
    if (camEl)
      void captureFrame(camEl.scanner?.video, "manual", { ai: $<HTMLSelectElement>("ai").value });
  });
}
