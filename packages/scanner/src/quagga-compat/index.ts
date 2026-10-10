// @qhago/scanner/quagga-compat — API estilo Quagga2 sobre createScanner()/decode() (F4.4).
// Migración: cambiar `import Quagga from "@ericblade/quagga2"` por `import Quagga from "@qhago/scanner/quagga-compat"`.
import { decode } from "../index";
import { createScanner, type Scanner } from "../scanner/scanner";
import type { TrackedResult } from "../scanner/types";
import type { BarcodeFormat, BarcodeResult, Point, Rect } from "../types";

type XY = [number, number];

export interface QuaggaJSCodeResult {
  code: string;
  format: string;
  start?: number;
  end?: number;
  startInfo: Record<string, unknown>;
  decodedCodes: unknown[];
  direction?: number;
}

export interface QuaggaJSResultObject {
  codeResult: QuaggaJSCodeResult;
  box: XY[];
  boxes: XY[][];
  line: Point[];
  angle?: number;
  pattern?: number[];
}

type ReaderSpec = string | { format: string; config?: { supplements?: string[] } };

export interface QuaggaJSConfigObject {
  inputStream?: {
    name?: string;
    type?: "LiveStream" | "ImageStream" | "VideoStream";
    target?: Element | string | null;
    constraints?: MediaTrackConstraints & {
      width?: number | ConstrainULong;
      height?: number | ConstrainULong;
    };
    area?: {
      top?: string;
      right?: string;
      left?: string;
      bottom?: string;
      borderColor?: string;
      borderWidth?: number;
      backgroundColor?: string;
    };
    singleChannel?: boolean;
    size?: number;
  };
  decoder?: { readers?: ReaderSpec[]; debug?: unknown; multiple?: boolean };
  locator?: {
    halfSample?: boolean;
    patchSize?: string;
    debug?: unknown;
    willReadFrequently?: boolean;
  };
  locate?: boolean;
  numOfWorkers?: number;
  frequency?: number;
  debug?: unknown;
  src?: string;
}

const READERS: Record<string, BarcodeFormat> = {
  code_128_reader: "code_128",
  ean_reader: "ean_13",
  ean_8_reader: "ean_8",
  upc_reader: "upc_a",
  upc_e_reader: "upc_e",
  code_39_reader: "code_39",
  code_39_vin_reader: "code_39",
  codabar_reader: "codabar",
  i2of5_reader: "itf",
  code_93_reader: "code_93",
  // Extensiones (Quagga2 no las tiene): QR/DataMatrix… con su nombre de BarcodeDetector.
  qr_code_reader: "qr_code",
  data_matrix_reader: "data_matrix",
  pdf417_reader: "pdf417",
  aztec_reader: "aztec",
};
// Nombre que Quagga2 pone en codeResult.format.
const QUAGGA_FORMAT: Partial<Record<BarcodeFormat, string>> = {
  code_128: "code_128",
  ean_13: "ean_13",
  ean_8: "ean_8",
  upc_a: "upc_a",
  upc_e: "upc_e",
  code_39: "code_39",
  codabar: "codabar",
  itf: "i2of5",
  code_93: "code_93",
};

const warned = new Set<string>();
function warnOnce(key: string, msg: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[qhago/quagga-compat] ${msg}`);
}

/** VIN (ISO 3779): 17 caracteres sin I/O/Q y dígito de control en la posición 9 (NA). */
export function isValidVin(v: string): boolean {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return false;
  const tr = "0123456789.ABCDEFGH..JKLMN.P.R..STUVWXYZ";
  const w = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = v[i] as string;
    const val = /\d/.test(c) ? Number(c) : tr.indexOf(c) % 10;
    sum += val * (w[i] as number);
  }
  const check = sum % 11 === 10 ? "X" : String(sum % 11);
  return v[8] === check;
}

function parseReaders(readers: ReaderSpec[] | undefined): {
  formats: BarcodeFormat[];
  vin: boolean;
} {
  const formats = new Set<BarcodeFormat>();
  let vin = false;
  for (const r of readers ?? ["code_128_reader"]) {
    const name = typeof r === "string" ? r : r.format;
    if (typeof r !== "string" && r.config?.supplements?.length)
      warnOnce("supplements", "Los suplementos EAN-2/EAN-5 no están soportados; se ignoran.");
    const f = READERS[name];
    if (!f) {
      warnOnce(`reader:${name}`, `Reader "${name}" no soportado; se ignora.`);
      continue;
    }
    if (name === "code_39_vin_reader") vin = true;
    formats.add(f);
  }
  return { formats: [...formats], vin };
}

function pct(v: string | undefined): number {
  return v ? Math.min(1, Math.max(0, Number.parseFloat(v) / 100)) : 0;
}

function areaToRoi(a: NonNullable<QuaggaJSConfigObject["inputStream"]>["area"]): Rect | "full" {
  if (!a) return "full";
  const top = pct(a.top);
  const left = pct(a.left);
  const width = 1 - left - pct(a.right);
  const height = 1 - top - pct(a.bottom);
  return width > 0 && height > 0 ? { x: left, y: top, width, height } : "full";
}

function warnIgnored(cfg: QuaggaJSConfigObject): void {
  if (cfg.locator?.halfSample !== undefined || cfg.locator?.patchSize !== undefined)
    warnOnce("locator", "locator.halfSample/patchSize se ignoran: el motor localiza por sí mismo.");
  if (cfg.locate === false) warnOnce("locate", "locate:false se ignora (siempre se localiza).");
  if (cfg.inputStream?.singleChannel !== undefined || cfg.inputStream?.size !== undefined)
    warnOnce("size", "inputStream.size/singleChannel se ignoran.");
  if (cfg.decoder?.debug || cfg.locator?.debug || cfg.debug)
    warnOnce("debug", "Las opciones debug se ignoran.");
}

function toResult(r: BarcodeResult, all: XY[][] = []): QuaggaJSResultObject {
  const c = r.cornerPoints;
  const box = c.map((p) => [p.x, p.y] as XY);
  // Línea de lectura: segmento entre los puntos medios de los lados izquierdo y derecho.
  const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  return {
    codeResult: {
      code: r.text,
      format: QUAGGA_FORMAT[r.format] ?? r.format,
      startInfo: {},
      decodedCodes: [],
    },
    box,
    boxes: all.length ? all : [box],
    line: [mid(c[0], c[3]), mid(c[1], c[2])],
    angle: Math.atan2(c[1].y - c[0].y, c[1].x - c[0].x),
  };
}

type Cb = (r: QuaggaJSResultObject) => void;
type ProcessedCb = (r: QuaggaJSResultObject | undefined) => void;

let config: QuaggaJSConfigObject = {};
let scanner: Scanner | null = null;
let vinOnly = false;
const detected = new Set<Cb>();
const processed = new Set<ProcessedCb>();
let frameBoxes: XY[][] = [];
let frameResult: BarcodeResult | null = null;

const canvas: {
  ctx: { image: CanvasRenderingContext2D | null; overlay: CanvasRenderingContext2D | null };
  dom: { image: HTMLCanvasElement | null; overlay: HTMLCanvasElement | null };
} = {
  ctx: { image: null, overlay: null },
  dom: { image: null, overlay: null },
};

function resolveTarget(t: Element | string | null | undefined): Element | null {
  if (typeof document === "undefined") return null;
  if (typeof t === "string") return document.querySelector(t);
  return t ?? document.querySelector("#interactive.viewport");
}

function setupDom(target: Element | null): HTMLVideoElement {
  let video: HTMLVideoElement;
  if (target instanceof HTMLVideoElement) video = target;
  else {
    video = target?.querySelector("video") ?? document.createElement("video");
    video.setAttribute("playsinline", "");
    video.muted = true;
    if (target && !video.parentElement) target.appendChild(video);
  }
  let overlay = target?.querySelector<HTMLCanvasElement>("canvas.drawingBuffer") ?? null;
  if (!overlay) {
    overlay = document.createElement("canvas");
    overlay.className = "drawingBuffer";
    (target instanceof HTMLVideoElement ? target.parentElement : target)?.appendChild(overlay);
  }
  canvas.dom.overlay = overlay;
  canvas.ctx.overlay = overlay.getContext("2d");
  return video;
}

function sizeOverlay(video: HTMLVideoElement): void {
  const o = canvas.dom.overlay;
  if (o && video.videoWidth && (o.width !== video.videoWidth || o.height !== video.videoHeight)) {
    o.width = video.videoWidth;
    o.height = video.videoHeight;
  }
}

function accept(r: BarcodeResult): boolean {
  return !vinOnly || r.format !== "code_39" || isValidVin(r.text);
}

function onTracked(r: TrackedResult): void {
  frameBoxes.push(r.cornerPoints.map((p) => [p.x, p.y] as XY));
  if (accept(r)) frameResult = r;
}

async function init(cfg: QuaggaJSConfigObject, cb?: (err?: unknown) => void): Promise<void> {
  try {
    config = cfg;
    warnIgnored(cfg);
    const { formats, vin } = parseReaders(cfg.decoder?.readers);
    vinOnly = vin;
    if (cfg.inputStream?.type && cfg.inputStream.type !== "LiveStream")
      warnOnce(
        "type",
        `inputStream.type "${cfg.inputStream.type}" no soportado en init(); usa decodeSingle().`,
      );
    scanner?.destroy();
    const video = setupDom(resolveTarget(cfg.inputStream?.target));
    const c = cfg.inputStream?.constraints ?? {};
    const num = (v: unknown) =>
      typeof v === "number" ? v : (v as { ideal?: number } | undefined)?.ideal;
    const [w, h] = [num(c.width), num(c.height)];
    scanner = createScanner({
      video,
      formats,
      roi: areaToRoi(cfg.inputStream?.area),
      maxFps: cfg.frequency,
      worker: cfg.numOfWorkers === undefined ? undefined : cfg.numOfWorkers > 0,
      frameStats: true,
      maxCodes: cfg.decoder?.multiple ? 8 : 4,
      camera: {
        deviceId: typeof c.deviceId === "string" ? c.deviceId : undefined,
        facingMode: c.facingMode === "user" ? "user" : "environment",
        resolution: w && h ? [w, h] : undefined,
      },
    });
    scanner.on("detect", (e) => {
      onTracked(e.result);
      if (accept(e.result)) for (const fn of detected) fn(toResult(e.result));
    });
    scanner.on("track", (e) => onTracked(e.result));
    scanner.on("candidate", (e) =>
      frameBoxes.push(e.result.cornerPoints.map((p) => [p.x, p.y] as XY)),
    );
    scanner.on("frame", () => {
      sizeOverlay(video);
      const res = frameResult ? toResult(frameResult, frameBoxes) : undefined;
      if (!res && frameBoxes.length) {
        // Sin lectura pero con símbolos localizados: Quagga2 entrega { boxes } sin codeResult.
        for (const fn of processed) fn({ boxes: frameBoxes } as unknown as QuaggaJSResultObject);
      } else for (const fn of processed) fn(res);
      frameBoxes = [];
      frameResult = null;
    });
    // Quagga2 pide la cámara en init() y empieza a decodificar en start(): se arranca y se pausa.
    await scanner.start();
    scanner.pause();
    cb?.();
  } catch (e) {
    if (cb) cb(e);
    else throw e;
  }
}

function start(): void {
  scanner?.resume();
}

function pause(): void {
  scanner?.pause();
}

async function stop(): Promise<void> {
  const s = scanner;
  scanner = null;
  s?.destroy();
}

async function decodeSingle(
  cfg: QuaggaJSConfigObject,
  cb?: (r: QuaggaJSResultObject | undefined) => void,
): Promise<QuaggaJSResultObject | undefined> {
  warnIgnored(cfg);
  const { formats, vin } = parseReaders(cfg.decoder?.readers);
  if (!cfg.src) throw new TypeError("decodeSingle: falta config.src");
  const res = await fetch(cfg.src);
  const results = (await decode(await res.blob(), { formats, strategy: "thorough" })).filter(
    (r) => !vin || r.format !== "code_39" || isValidVin(r.text),
  );
  const boxes = results.map((r) => r.cornerPoints.map((p) => [p.x, p.y] as XY));
  const out = results[0] ? toResult(results[0], boxes) : undefined;
  cb?.(out);
  return out;
}

function drawPath(
  path: (Point | XY)[],
  def: { x: string | number; y: string | number },
  ctx: CanvasRenderingContext2D,
  style: { color?: string; lineWidth?: number },
): void {
  if (!path.length) return;
  ctx.strokeStyle = style.color ?? "red";
  ctx.fillStyle = style.color ?? "red";
  ctx.lineWidth = style.lineWidth ?? 1;
  ctx.beginPath();
  const get = (p: Point | XY, k: string | number) =>
    (p as unknown as Record<string | number, number>)[k] as number;
  ctx.moveTo(get(path[0] as Point, def.x), get(path[0] as Point, def.y));
  for (const p of path.slice(1)) ctx.lineTo(get(p, def.x), get(p, def.y));
  ctx.closePath();
  ctx.stroke();
}

function drawRect(
  pos: Point,
  size: Point,
  ctx: CanvasRenderingContext2D,
  style: { color?: string; lineWidth?: number },
): void {
  ctx.strokeStyle = style.color ?? "red";
  ctx.lineWidth = style.lineWidth ?? 1;
  ctx.strokeRect(pos.x, pos.y, size.x, size.y);
}

const CameraAccess = {
  async request(
    video: HTMLVideoElement | null,
    constraints?: MediaTrackConstraints,
  ): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: constraints ?? { facingMode: "environment" },
    });
    if (video) {
      video.srcObject = stream;
      await video.play();
    }
  },
  async release(): Promise<void> {
    await stop();
  },
  async enumerateVideoDevices(): Promise<MediaDeviceInfo[]> {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
  },
  getActiveTrack(): MediaStreamTrack | null {
    const s = scanner?.video?.srcObject as MediaStream | null | undefined;
    return s?.getVideoTracks()[0] ?? null;
  },
  getActiveStreamLabel(): string {
    return CameraAccess.getActiveTrack()?.label ?? "";
  },
  /** Quagga2: linterna on/off. */
  async enableTorch(): Promise<void> {
    await scanner?.setTorch(true);
  },
  async disableTorch(): Promise<void> {
    await scanner?.setTorch(false);
  },
};

export const Quagga = {
  init,
  start,
  stop,
  pause,
  decodeSingle,
  onDetected: (cb: Cb) => void detected.add(cb),
  offDetected: (cb?: Cb) => void (cb ? detected.delete(cb) : detected.clear()),
  onProcessed: (cb: ProcessedCb) => void processed.add(cb),
  offProcessed: (cb?: ProcessedCb) => void (cb ? processed.delete(cb) : processed.clear()),
  setReaders(readers: ReaderSpec[]): void {
    config = { ...config, decoder: { ...config.decoder, readers } };
    if (scanner)
      warnOnce(
        "setReaders",
        "setReaders() en caliente requiere reiniciar: llama a init() de nuevo.",
      );
  },
  registerReader(name: string): void {
    warnOnce(`register:${name}`, "registerReader() no está soportado (readers JS propios).");
  },
  canvas,
  ImageDebug: { drawPath, drawRect },
  CameraAccess,
  /** Acceso a la instancia moderna (escape hatch). */
  get scanner(): Scanner | null {
    return scanner;
  },
};

export default Quagga;
