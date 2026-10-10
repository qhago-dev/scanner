import { isBarcodeFormat } from "../formats";
import { mapToElement } from "../geometry";
import { createScanner, type Scanner } from "../scanner/scanner";
import type { ScannerState, TrackedResult } from "../scanner/types";
import type { BarcodeFormat, Point, Rect } from "../types";

export interface QhagoScannerLabels {
  start: string;
  stop: string;
  torchOn: string;
  torchOff: string;
  switchCamera: string;
  scanning: string;
  read: string;
  error: string;
}

export const LABELS: Record<"es" | "en", QhagoScannerLabels> = {
  es: {
    start: "Iniciar escáner",
    stop: "Detener escáner",
    torchOn: "Encender linterna",
    torchOff: "Apagar linterna",
    switchCamera: "Cambiar de cámara",
    scanning: "Buscando códigos…",
    read: "Leído",
    error: "Error",
  },
  en: {
    start: "Start scanner",
    stop: "Stop scanner",
    torchOn: "Turn flashlight on",
    torchOff: "Turn flashlight off",
    switchCamera: "Switch camera",
    scanning: "Looking for codes…",
    read: "Read",
    error: "Error",
  },
};

const CSS = `
:host { display: block; position: relative; overflow: hidden; background: #000; contain: content;
  --qhago-accent: #22c55e; --qhago-mask: rgba(0,0,0,.45); aspect-ratio: 4 / 3; color: #fff; font: 14px system-ui, sans-serif; }
:host([hidden]) { display: none; }
video, canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
canvas { pointer-events: none; }
[part="frame"] { position: absolute; box-shadow: 0 0 0 100vmax var(--qhago-mask); border: 2px solid var(--qhago-accent); border-radius: 8px; pointer-events: none; }
.bar { position: absolute; inset: auto 0 0 0; display: flex; gap: 8px; justify-content: center; padding: 10px; }
[part~="button"] { min-width: 44px; min-height: 44px; border-radius: 22px; border: 0; padding: 0 14px; background: rgba(0,0,0,.65);
  color: #fff; font: inherit; cursor: pointer; }
[part~="button"]:focus-visible { outline: 3px solid var(--qhago-accent); outline-offset: 2px; }
[part~="button"][aria-pressed="true"] { background: var(--qhago-accent); color: #000; }
[part="status"] { position: absolute; top: 8px; left: 8px; right: 8px; text-align: center; text-shadow: 0 1px 2px #000; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`;

const Base: typeof HTMLElement =
  typeof HTMLElement === "undefined" ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

interface Drawn {
  pts: Point[];
  target: Point[];
  read: boolean;
  text: string;
}

/**
 * `<qhago-scanner>`: cámara + overlay + controles. Eventos: `detect`, `candidate` (detail = TrackedResult),
 * `statechange` (detail = ScannerState) y `error` (detail = ScanError).
 */
export class QhagoScannerElement extends Base {
  static observedAttributes = [
    "formats",
    "roi",
    "torch-button",
    "switch-camera-button",
    "lang",
    "paused",
  ];

  /** Textos de los botones/estado; por defecto según `lang` (es/en). */
  labels: Partial<QhagoScannerLabels> = {};
  private _scanner: Scanner | null = null;
  private root!: ShadowRoot;
  private video!: HTMLVideoElement;
  private canvas!: HTMLCanvasElement;
  private frame!: HTMLElement;
  private status!: HTMLElement;
  private live!: HTMLElement;
  private torchBtn!: HTMLButtonElement;
  private switchBtn!: HTMLButtonElement;
  private tracks = new Map<number, Drawn>();
  private raf = 0;
  private ro: ResizeObserver | null = null;
  private audio: AudioContext | null = null;
  private torchOn = false;
  private cameraIndex = 0;

  get scanner(): Scanner | null {
    return this._scanner;
  }

  private t(k: keyof QhagoScannerLabels): string {
    const lang = (
      this.getAttribute("lang") ??
      document.documentElement.lang ??
      navigator.language ??
      "en"
    ).slice(0, 2);
    return this.labels[k] ?? (LABELS[lang as "es"] ?? LABELS.en)[k];
  }

  connectedCallback(): void {
    if (!this.root) this.build();
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this);
    if (!this.hasAttribute("paused")) void this.start();
  }

  disconnectedCallback(): void {
    this.ro?.disconnect();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this._scanner?.destroy();
    this._scanner = null;
    void this.audio?.close();
    this.audio = null;
  }

  attributeChangedCallback(name: string, old: string | null, val: string | null): void {
    if (!this.root || old === val) return;
    if (name === "paused") {
      if (val === null) this._scanner ? this._scanner.resume() : void this.start();
      else this._scanner?.pause();
    } else if (name === "roi") this.layout();
    else if (name === "formats" && this._scanner) void this.restart();
    this.syncButtons();
  }

  /** Arranca (o reanuda) la cámara. */
  async start(): Promise<void> {
    if (this._scanner) {
      this._scanner.resume();
      return;
    }
    const s = createScanner({ video: this.video, formats: this.formats(), roi: this.roi() });
    this._scanner = s;
    s.on("detect", (e) => this.onDetect(e.result));
    s.on("track", (e) => this.upsert(e.result, true));
    s.on("candidate", (e) => {
      this.upsert(e.result, false);
      this.dispatchEvent(new CustomEvent("candidate", { detail: e.result }));
    });
    s.on("lost", (e) => this.tracks.delete(e.trackId));
    s.on("state", (e) => this.onState(e.state));
    s.on("error", (e) => {
      this.status.textContent = `${this.t("error")}: ${e.error.message}`;
      this.dispatchEvent(new CustomEvent("error", { detail: e.error }));
    });
    try {
      await s.start();
      this.syncButtons();
      this.loop();
    } catch (e) {
      // El evento "error" ya se emitió vía el scanner si aplica; se re-emite por si el fallo fue previo.
      this.dispatchEvent(new CustomEvent("error", { detail: e }));
    }
  }

  pause(): void {
    this._scanner?.pause();
  }

  async stop(): Promise<void> {
    const s = this._scanner;
    this._scanner = null;
    this.tracks.clear();
    await s?.stop();
    s?.destroy();
  }

  private async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  private build(): void {
    this.root = this.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${CSS}</style>
<video part="video" playsinline muted autoplay></video>
<canvas part="overlay"></canvas>
<div part="frame" hidden></div>
<div part="status" aria-hidden="true"></div>
<div class="sr" role="status" aria-live="polite" aria-atomic="true"></div>
<div class="bar">
  <button type="button" part="button torch" hidden aria-pressed="false"></button>
  <button type="button" part="button switch" hidden></button>
</div><slot></slot>`;
    const q = <T extends Element>(s: string) => this.root.querySelector(s) as T;
    this.video = q("video");
    this.canvas = q("canvas");
    this.frame = q('[part="frame"]');
    this.status = q('[part="status"]');
    this.live = q('[role="status"]');
    this.torchBtn = q('[part~="torch"]');
    this.switchBtn = q('[part~="switch"]');
    this.torchBtn.addEventListener("click", () => void this.toggleTorch());
    this.switchBtn.addEventListener("click", () => void this.nextCamera());
  }

  private formats(): BarcodeFormat[] | undefined {
    const v = this.getAttribute("formats");
    if (!v) return undefined;
    const list = v.split(/[\s,]+/).filter(Boolean);
    const bad = list.filter((f) => !isBarcodeFormat(f));
    if (bad.length)
      console.warn(`[qhago-scanner] formatos desconocidos ignorados: ${bad.join(", ")}`);
    return list.filter(isBarcodeFormat);
  }

  private roi(): Rect | "full" {
    const v = this.getAttribute("roi");
    if (!v) return "full";
    const [x, y, width, height] = v.split(/[\s,]+/).map(Number);
    if ([x, y, width, height].some((n) => n === undefined || !Number.isFinite(n))) return "full";
    return { x: x as number, y: y as number, width: width as number, height: height as number };
  }

  private syncButtons(): void {
    const caps = this._scanner?.state === "scanning" ? this._scanner.getCapabilities() : null;
    this.torchBtn.hidden = !this.hasAttribute("torch-button") || !caps?.torch;
    this.torchBtn.setAttribute("aria-pressed", String(this.torchOn));
    this.torchBtn.textContent = "🔦";
    this.torchBtn.setAttribute("aria-label", this.t(this.torchOn ? "torchOff" : "torchOn"));
    this.switchBtn.hidden = !this.hasAttribute("switch-camera-button");
    this.switchBtn.textContent = "🔄";
    this.switchBtn.setAttribute("aria-label", this.t("switchCamera"));
  }

  private async toggleTorch(): Promise<void> {
    this.torchOn = !this.torchOn;
    await this._scanner?.setTorch(this.torchOn).catch(() => {
      this.torchOn = false;
    });
    this.syncButtons();
  }

  private async nextCamera(): Promise<void> {
    const s = this._scanner;
    if (!s) return;
    const cams = await s.listCameras();
    if (cams.length < 2) return;
    this.cameraIndex = (this.cameraIndex + 1) % cams.length;
    await s.switchCamera((cams[this.cameraIndex] as { deviceId: string }).deviceId);
    this.tracks.clear();
    this.syncButtons();
  }

  private onState(state: ScannerState): void {
    this.status.textContent = state === "scanning" ? this.t("scanning") : "";
    this.dispatchEvent(new CustomEvent("statechange", { detail: state }));
    this.syncButtons();
  }

  private onDetect(r: TrackedResult): void {
    this.upsert(r, true);
    this.live.textContent = `${this.t("read")}: ${r.text}`;
    if (this.hasAttribute("beep")) this.beep();
    if (this.hasAttribute("vibrate")) navigator.vibrate?.(60);
    this.dispatchEvent(new CustomEvent("detect", { detail: r }));
  }

  private upsert(r: TrackedResult, read: boolean): void {
    const target = mapToElement(r.cornerPoints, this.video);
    const cur = this.tracks.get(r.trackId);
    if (cur) {
      cur.target = target;
      cur.read ||= read;
      cur.text = r.text;
    } else this.tracks.set(r.trackId, { pts: target, target, read, text: r.text });
  }

  private beep(): void {
    try {
      this.audio ??= new AudioContext();
      const ctx = this.audio;
      void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 1800;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch {
      // Sin WebAudio: silencio.
    }
  }

  private layout(): void {
    const dpr = globalThis.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.clientWidth * dpr);
    this.canvas.height = Math.round(this.clientHeight * dpr);
    const roi = this.roi();
    this.frame.hidden = roi === "full" || !this.video.videoWidth;
    if (roi !== "full" && this.video.videoWidth) {
      const [a, b] = mapToElement(
        [
          { x: roi.x * this.video.videoWidth, y: roi.y * this.video.videoHeight },
          {
            x: (roi.x + roi.width) * this.video.videoWidth,
            y: (roi.y + roi.height) * this.video.videoHeight,
          },
        ],
        this.video,
      ) as [Point, Point];
      Object.assign(this.frame.style, {
        left: `${Math.min(a.x, b.x)}px`,
        top: `${a.y}px`,
        width: `${Math.abs(b.x - a.x)}px`,
        height: `${b.y - a.y}px`,
      });
    }
  }

  private loop(): void {
    if (this.raf) return;
    let lastW = 0;
    const draw = () => {
      this.raf = requestAnimationFrame(draw);
      if (this.video.videoWidth !== lastW) {
        lastW = this.video.videoWidth;
        this.layout();
      }
      const ctx = this.canvas.getContext("2d");
      if (!ctx) return;
      const dpr = globalThis.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      const accent = getComputedStyle(this).getPropertyValue("--qhago-accent").trim() || "#22c55e";
      for (const d of this.tracks.values()) {
        // Interpolación exponencial hacia la última posición (overlay suave entre frames procesados).
        d.pts = d.pts.map((p, i) => {
          const t = d.target[i] as Point;
          return { x: p.x + (t.x - p.x) * 0.35, y: p.y + (t.y - p.y) * 0.35 };
        });
        ctx.beginPath();
        for (const [i, p] of d.pts.entries()) {
          if (i) ctx.lineTo(p.x, p.y);
          else ctx.moveTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.lineWidth = 3;
        ctx.strokeStyle = d.read ? accent : "rgba(255,255,255,.7)";
        ctx.setLineDash(d.read ? [] : [6, 6]);
        ctx.stroke();
      }
    };
    this.raf = requestAnimationFrame(draw);
  }
}
