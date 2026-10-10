// createScanner(): cámara + worker + fusión multi-frame (F3).
import { ScanError, throwIfAborted } from "../errors";
import { DEFAULT_FORMATS, isBarcodeFormat } from "../formats";
import { browserPlatform } from "../platform-browser";
import { missingPluginError } from "../plugins";
import type { BarcodeFormat, DecodeStrategy, Rect, ScannerPluginDescriptor } from "../types";
import { assertPlugins, canUseWorker, createReadyWorker } from "../worker/client";
import type { FromWorker, ToWorker } from "../worker/protocol";
import {
  applyAdvanced,
  betterCamera,
  type CameraCapabilities,
  type CameraInfo,
  capabilitiesOf,
  listCameras,
  openStream,
} from "./camera";
import { Scheduler } from "./scheduler";
import { type FrameMeta, ScannerSession, type WireEvent } from "./session";
import type { FusionOptions, ScannerEvent, ScannerState, ScannerWorkerOptions } from "./types";

export interface ScannerOptions {
  /** <video> donde mostrar la cámara. Si no se pasa, se crea uno sin insertar en el DOM. */
  video?: HTMLVideoElement;
  /** Stream propio (p. ej. de otra librería). No se detiene en stop() salvo `ownStream: true`. */
  stream?: MediaStream;
  ownStream?: boolean;
  /** Default: DEFAULT_FORMATS (ADR-05). */
  formats?: readonly BarcodeFormat[];
  /** ROI normalizada 0..1 respecto del frame. Default "full". */
  roi?: Rect | "full";
  /** Estrategia por frame. Default "fast": el vídeo da muchas oportunidades y el escalado cubre los difíciles. */
  strategy?: DecodeStrategy;
  fusion?: Partial<FusionOptions>;
  camera?: {
    deviceId?: string;
    facingMode?: "environment" | "user";
    resolution?: [number, number];
    /** Recordar la última cámara elegida (localStorage). Default true. */
    rememberCamera?: boolean;
  };
  /** Procesar en un Web Worker. Default true si el navegador lo soporta. */
  worker?: boolean;
  /** Default 15. */
  maxFps?: number;
  /** Frames sin nada antes del barrido rotativo / plugins. Default 3. */
  escalateAfterFrames?: number;
  /** Ancho al que se reduce cada frame (ruta 2). Default 1280. */
  processingWidth?: number | "native";
  /** Máximo de códigos por frame. Default 4. */
  maxCodes?: number;
  validateChecksums?: boolean | "strict";
  /** ms sin ver un track antes de emitir "lost". Default 500. */
  lostAfterMs?: number;
  /** Emitir eventos "frame" con estadísticas. Default false. */
  frameStats?: boolean;
  /** Forzar ruta de captura (tests/diagnóstico). Default "auto". */
  route?: "auto" | "track-processor" | "frame-callback" | "inline";
  /** Fábrica de workers (p. ej. aiWorker de @qhago/ai). */
  workerFactory?: () => Worker;
  /** Plugins del worker (ver `ScannerPluginDescriptor`); se activan tras `escalateAfterFrames` frames vacíos. */
  plugins?: readonly ScannerPluginDescriptor[];
}

type Handler<K extends ScannerEvent["type"]> = (e: Extract<ScannerEvent, { type: K }>) => void;
export type ScannerRoute = "track-processor" | "frame-callback" | "inline";

const STORAGE_KEY = "qhago:camera";
let nextSid = 1;

function transferableStreams(): boolean {
  try {
    const rs = new ReadableStream();
    structuredClone(rs, { transfer: [rs as unknown as Transferable] });
    return true;
  } catch {
    return false;
  }
}

function remembered(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export class Scanner {
  private listeners = new Map<string, Set<(e: ScannerEvent) => void>>();
  private _state: ScannerState = "idle";
  private _video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private worker: Worker | null = null;
  private inline: ScannerSession | null = null;
  private scheduler: Scheduler;
  private sid = nextSid++;
  private frameId = 0;
  private running = false;
  private userPaused = false;
  private _route: ScannerRoute | null = null;
  private lastDims = "";
  /** Sube en cada teardown: los ticks asíncronos de una sesión anterior se descartan. */
  private generation = 0;
  private cleanup: (() => void)[] = [];
  private readonly opts: ScannerOptions;

  constructor(options: ScannerOptions = {}) {
    for (const f of options.formats ?? []) {
      if (!isBarcodeFormat(f))
        throw new ScanError("INVALID_INPUT", `Formato desconocido: ${String(f)}`);
    }
    this.opts = options;
    this.scheduler = new Scheduler(options.maxFps ?? 15);
  }

  get state(): ScannerState {
    return this._state;
  }
  get video(): HTMLVideoElement | null {
    return this._video;
  }
  /** Ruta de captura activa (diagnóstico). */
  get route(): ScannerRoute | null {
    return this._route;
  }

  on<K extends ScannerEvent["type"]>(type: K, fn: Handler<K>): () => void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(fn as (e: ScannerEvent) => void);
    this.listeners.set(type, set);
    return () => this.off(type, fn);
  }

  off<K extends ScannerEvent["type"]>(type: K, fn: Handler<K>): void {
    this.listeners.get(type)?.delete(fn as (e: ScannerEvent) => void);
  }

  private emit(e: ScannerEvent): void {
    for (const fn of this.listeners.get(e.type) ?? []) {
      try {
        fn(e);
      } catch (err) {
        console.error("[qhago] error en un listener:", err);
      }
    }
  }

  private setState(s: ScannerState): void {
    if (this._state === s) return;
    this._state = s;
    this.emit({ type: "state", state: s });
  }

  private workerOptions(): ScannerWorkerOptions {
    const o = this.opts;
    return {
      formats: o.formats ?? DEFAULT_FORMATS,
      strategy: o.strategy ?? "fast",
      roi: o.roi ?? "full",
      fusion: { confirmFrames: "auto", windowMs: 1500, duplicateCooldownMs: 2000, ...o.fusion },
      escalateAfterFrames: o.escalateAfterFrames ?? 3,
      maxCodes: o.maxCodes ?? 4,
      lostAfterMs: o.lostAfterMs ?? 500,
      validateChecksums: o.validateChecksums ?? true,
      plugins: o.plugins,
    };
  }

  private onWire(e: WireEvent): void {
    if (e.type === "error") this.emit({ type: "error", error: new ScanError(e.code, e.message) });
    else if (e.type !== "frame" || this.opts.frameStats) this.emit(e as ScannerEvent);
  }

  async start(options?: { signal?: AbortSignal }): Promise<void> {
    if (this._state === "scanning" || this._state === "starting") return;
    if (this._state === "destroyed") throw new ScanError("UNSUPPORTED", "El scanner fue destruido");
    this.setState("starting");
    try {
      throwIfAborted(options?.signal);
      await this.openCamera();
      throwIfAborted(options?.signal);
      await this.openTransport();
      throwIfAborted(options?.signal);
      this.startFrames();
      this.watchVisibility();
      this.running = true;
      this.userPaused = false;
      this.setState("scanning");
    } catch (e) {
      const err =
        e instanceof ScanError ? e : new ScanError("UNSUPPORTED", String(e), { cause: e });
      this.teardown();
      this.setState("error");
      this.emit({ type: "error", error: err });
      throw err;
    }
  }

  private async openCamera(): Promise<void> {
    const cam = this.opts.camera ?? {};
    const remember = cam.rememberCamera !== false;
    if (this.opts.stream) {
      this.stream = this.opts.stream;
    } else {
      const deviceId = cam.deviceId ?? (remember ? remembered() : undefined);
      const resolution = cam.resolution ?? [1280, 720];
      this.stream = await openStream({ deviceId, facingMode: cam.facingMode, resolution });
      // Heurística de cámara principal: solo si no se eligió una explícitamente.
      const track = this.stream.getVideoTracks()[0];
      if (!deviceId && track && (cam.facingMode ?? "environment") === "environment") {
        const better = await betterCamera(track).catch(() => null);
        if (better) {
          for (const t of this.stream.getTracks()) t.stop();
          this.stream = await openStream({ deviceId: better, resolution });
        }
      }
      const id = this.stream.getVideoTracks()[0]?.getSettings().deviceId;
      if (remember && id) {
        try {
          localStorage.setItem(STORAGE_KEY, id);
        } catch {}
      }
    }
    const track = this.stream.getVideoTracks()[0];
    if (!track) throw new ScanError("NO_CAMERA", "El stream no tiene pista de vídeo");
    if (capabilitiesOf(track).focusContinuous)
      await applyAdvanced(track, { focusMode: "continuous" }).catch(() => {});
    const v = this.opts.video ?? document.createElement("video");
    // iOS Safari: sin playsinline/muted el vídeo no se reproduce inline.
    v.playsInline = true;
    v.muted = true;
    v.setAttribute("playsinline", "");
    v.setAttribute("muted", "");
    v.autoplay = true;
    v.srcObject = this.stream;
    // play() puede no resolver nunca (motores sin soporte del stream): se acota para que start() no se cuelgue.
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      v.play(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout de 10 s")), 10_000);
      }),
    ])
      .catch((e) => {
        throw new ScanError(
          "UNSUPPORTED",
          `No se pudo reproducir el vídeo de la cámara: ${String((e as Error)?.message ?? e)}`,
          { cause: e },
        );
      })
      .finally(() => clearTimeout(timer));
    if (!v.videoWidth)
      await new Promise((r) => v.addEventListener("loadedmetadata", r, { once: true }));
    this._video = v;
  }

  private chooseRoute(): ScannerRoute {
    const r = this.opts.route ?? "auto";
    const workerOk = this.opts.worker !== false && canUseWorker();
    const mstp =
      typeof (globalThis as { MediaStreamTrackProcessor?: unknown }).MediaStreamTrackProcessor ===
        "function" && transferableStreams();
    if (!workerOk) return "inline";
    // Una ruta forzada que el navegador no soporta (p. ej. track-processor en Firefox) degrada a la siguiente.
    if (r === "track-processor") return mstp ? r : "frame-callback";
    if (r !== "auto") return r;
    return mstp ? "track-processor" : "frame-callback";
  }

  private async openTransport(): Promise<void> {
    this._route = this.chooseRoute();
    if (this._route === "inline") {
      if (this.opts.plugins?.length) throw missingPluginError(this.opts.plugins.map((d) => d.name));
      this.inline = new ScannerSession(this.workerOptions(), browserPlatform, (e) =>
        this.onWire(e),
      );
      await browserPlatform.loadEngine();
      return;
    }
    this.worker = await createReadyWorker((m) => this.onWorker(m), this.opts.workerFactory);
    try {
      assertPlugins(this.worker, this.opts.plugins);
    } catch (e) {
      this.worker.terminate();
      this.worker = null;
      throw e;
    }
    this.post({ t: "open", sid: this.sid, options: this.workerOptions() });
  }

  private post(m: ToWorker, transfer: Transferable[] = []): void {
    this.worker?.postMessage(m, transfer);
  }

  private onWorker(m: FromWorker): void {
    if (m.t === "event" && m.sid === this.sid) this.onWire(m.event);
    else if (m.t === "done" && m.sid === this.sid) {
      if (m.id >= 0) this.scheduler.done(m.ms);
      if (this.opts.frameStats)
        this.emit({ type: "frame", fps: this.scheduler.fps, ms: m.ms, passes: m.passes });
    }
  }

  private startFrames(): void {
    const video = this._video as HTMLVideoElement;
    const track = this.stream?.getVideoTracks()[0] as MediaStreamTrack;
    if (this._route === "track-processor") {
      const MSTP = (
        globalThis as unknown as {
          MediaStreamTrackProcessor: new (o: {
            track: MediaStreamTrack;
          }) => { readable: ReadableStream<VideoFrame> };
        }
      ).MediaStreamTrackProcessor;
      const { readable } = new MSTP({ track });
      this.post(
        {
          t: "stream",
          sid: this.sid,
          readable,
          srcWidth: video.videoWidth,
          srcHeight: video.videoHeight,
          maxFps: this.opts.maxFps ?? 15,
        },
        [readable as unknown as Transferable],
      );
      const onResize = () =>
        this.post({
          t: "source",
          sid: this.sid,
          srcWidth: video.videoWidth,
          srcHeight: video.videoHeight,
        });
      video.addEventListener("resize", onResize);
      this.cleanup.push(() => video.removeEventListener("resize", onResize));
      return;
    }

    // Rutas 2 y 3: un frame en vuelo, reducido a processingWidth.
    const hasRvfc = "requestVideoFrameCallback" in HTMLVideoElement.prototype;
    let handle = 0;
    const schedule = () => {
      handle = hasRvfc ? video.requestVideoFrameCallback(tick) : window.setTimeout(tick, 16);
    };
    const tick = async () => {
      if (!this.running && this._state !== "starting") return;
      const gen = this.generation;
      schedule();
      const now = performance.now();
      if (
        this.userPaused ||
        document.hidden ||
        !this.scheduler.canSend(now) ||
        video.readyState < 2
      )
        return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return;
      const dims = `${w}x${h}`;
      if (dims !== this.lastDims) {
        if (this.lastDims) {
          if (this.inline) this.inline.resetTracking();
          else this.post({ t: "source", sid: this.sid, srcWidth: w, srcHeight: h });
        }
        this.lastDims = dims;
      }
      this.scheduler.sent(now);
      const pw = this.opts.processingWidth ?? 1280;
      const tw = pw === "native" ? w : Math.min(w, pw);
      let bmp: ImageBitmap;
      try {
        bmp = await createImageBitmap(
          video,
          tw < w
            ? { resizeWidth: tw, resizeHeight: Math.round((h * tw) / w), resizeQuality: "low" }
            : {},
        );
      } catch {
        if (gen === this.generation) this.scheduler.done(0);
        return;
      }
      if (gen !== this.generation) {
        bmp.close();
        return;
      }
      const meta: FrameMeta = { ts: now, srcWidth: w, srcHeight: h };
      if (this.inline) {
        try {
          const r = await this.inline.process(bmp, meta);
          if (gen !== this.generation) return;
          this.scheduler.done(r.ms);
          if (this.opts.frameStats)
            this.emit({ type: "frame", fps: this.scheduler.fps, ms: r.ms, passes: r.passes });
        } finally {
          bmp.close();
        }
      } else {
        this.post({ t: "frame", sid: this.sid, id: this.frameId++, frame: bmp, meta }, [bmp]);
      }
    };
    schedule();
    this.cleanup.push(() => {
      if (hasRvfc) video.cancelVideoFrameCallback(handle);
      else clearTimeout(handle);
    });
  }

  private watchVisibility(): void {
    const onVis = () => {
      if (this._route !== "track-processor" || this.userPaused) return;
      this.post({ t: document.hidden ? "pause" : "resume", sid: this.sid });
    };
    document.addEventListener("visibilitychange", onVis);
    this.cleanup.push(() => document.removeEventListener("visibilitychange", onVis));
    // Batería baja (si el navegador la expone): la mitad de FPS.
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{
        level: number;
        charging: boolean;
        addEventListener: (t: string, f: () => void) => void;
      }>;
    };
    nav
      .getBattery?.()
      .then((b) => {
        const adjust = () =>
          this.scheduler.setMaxFps(
            (this.opts.maxFps ?? 15) / (b.level < 0.2 && !b.charging ? 2 : 1),
          );
        adjust();
        b.addEventListener("levelchange", adjust);
        b.addEventListener("chargingchange", adjust);
      })
      .catch(() => {});
  }

  pause(): void {
    if (this._state !== "scanning") return;
    this.userPaused = true;
    if (this._route === "track-processor") this.post({ t: "pause", sid: this.sid });
    this.setState("paused");
  }

  resume(): void {
    if (this._state !== "paused") return;
    this.userPaused = false;
    if (this._route === "track-processor") this.post({ t: "resume", sid: this.sid });
    this.setState("scanning");
  }

  private teardown(): void {
    this.running = false;
    this.generation++;
    this.scheduler.reset();
    for (const c of this.cleanup.splice(0)) c();
    if (this.worker) {
      this.post({ t: "close", sid: this.sid });
      this.worker.terminate();
      this.worker = null;
    }
    this.inline = null;
    const owns = !this.opts.stream || this.opts.ownStream === true;
    if (this.stream && owns) for (const t of this.stream.getTracks()) t.stop();
    if (this._video && owns) this._video.srcObject = null;
    this.stream = null;
    this.lastDims = "";
  }

  async stop(): Promise<void> {
    if (this._state === "idle" || this._state === "stopped" || this._state === "destroyed") return;
    this.teardown();
    this.setState("stopped");
  }

  destroy(): void {
    if (this._state === "destroyed") return;
    this.teardown();
    this.setState("destroyed");
    this.listeners.clear();
    if (!this.opts.video) this._video = null;
  }

  // ---------- Cámara ----------
  private track(): MediaStreamTrack {
    const t = this.stream?.getVideoTracks()[0];
    if (!t) throw new ScanError("NO_CAMERA", "El scanner no tiene cámara activa (llama a start())");
    return t;
  }

  getCapabilities(): CameraCapabilities {
    return capabilitiesOf(this.track());
  }

  async setTorch(on: boolean): Promise<void> {
    const t = this.track();
    if (!capabilitiesOf(t).torch)
      throw new ScanError("UNSUPPORTED", "Esta cámara no tiene linterna controlable");
    await applyAdvanced(t, { torch: on });
  }

  async setZoom(zoom: number): Promise<void> {
    const t = this.track();
    const z = capabilitiesOf(t).zoom;
    if (!z) throw new ScanError("UNSUPPORTED", "Esta cámara no permite zoom");
    await applyAdvanced(t, { zoom: Math.min(z.max, Math.max(z.min, zoom)) });
  }

  listCameras(): Promise<CameraInfo[]> {
    return listCameras();
  }

  async switchCamera(deviceId: string): Promise<void> {
    if (this.opts.stream)
      throw new ScanError("UNSUPPORTED", "No se puede cambiar de cámara con un stream externo");
    const wasScanning = this._state === "scanning" || this._state === "paused";
    if (wasScanning) await this.stop();
    this.opts.camera = { ...this.opts.camera, deviceId };
    if (wasScanning) await this.start();
  }
}

export function createScanner(options?: ScannerOptions): Scanner {
  return new Scanner(options);
}
