// Presentación: navegación por teclado/táctil + diapositiva en vivo con la librería real.
import { type DecodeStrategy, decode } from "@qhago/scanner";

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
    out.textContent = rs.length
      ? `${rs.length} código(s) en ${ms} ms\n\n${rs.map((r) => `${r.format}  ${r.text}  (confianza ${r.confidence.toFixed(2)})`).join("\n")}`
      : `Sin códigos (${ms} ms). Prueba strategy "thorough".`;
  } catch (e) {
    out.textContent = `${(e as { code?: string }).code ?? "Error"}: ${(e as Error).message}`;
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

document.getElementById("cam")?.addEventListener("click", async () => {
  const slot = document.getElementById("cam-slot") as HTMLElement;
  if (slot.firstElementChild) {
    slot.replaceChildren();
    return;
  }
  await import("@qhago/scanner/ui");
  const el = document.createElement("qhago-scanner");
  el.setAttribute("formats", "ean_13,ean_8,upc_a,code_128,qr_code,data_matrix");
  el.setAttribute("torch-button", "");
  el.setAttribute("switch-camera-button", "");
  el.setAttribute("beep", "");
  el.setAttribute("lang", "es");
  el.addEventListener("detect", (ev) => {
    const r = (ev as CustomEvent<{ format: string; text: string }>).detail;
    out.textContent = `cámara → ${r.format}  ${r.text}`;
  });
  slot.append(el);
});
