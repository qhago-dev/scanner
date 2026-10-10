// Modo depuración (?debug=<token>, servido por debug-server.ts): logs + fotogramas reales al servidor local.
// El token llega por ?debug= o lo inyecta debug-server.ts en <meta name="qhago-debug">.
const token =
  new URLSearchParams(location.search).get("debug") ??
  document.querySelector<HTMLMetaElement>('meta[name="qhago-debug"]')?.content ??
  null;
export const debugOn = !!token;
const sid = `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-${Math.random().toString(36).slice(2, 6)}`;
const t0 = performance.now();
let queue: string[] = [];
let shots = 0;
let sent = 0;
let failed = 0;
const MAX_SHOTS = 300;
export const debugStats = { onChange: () => {} };

export function dlog(type: string, data: Record<string, unknown> = {}): void {
  if (!debugOn) return;
  queue.push(
    JSON.stringify({
      t: Math.round(performance.now() - t0),
      at: new Date().toISOString(),
      type,
      ...data,
    }),
  );
}

async function post(
  path: string,
  body: BodyInit,
  params: Record<string, string> = {},
): Promise<void> {
  const q = new URLSearchParams({ sid, ...params });
  const r = await fetch(`/debug/${path}?${q}`, {
    method: "POST",
    headers: { "x-debug-token": token ?? "" },
    body,
    keepalive: typeof body === "string" && body.length < 60_000,
  });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
}

async function flush(): Promise<void> {
  if (!queue.length) return;
  const lines = queue;
  queue = [];
  try {
    await post("log", `${lines.join("\n")}\n`);
  } catch {
    queue = [...lines, ...queue].slice(-2000);
  }
}

/** Guarda el fotograma actual del vídeo a resolución nativa (JPEG 0,92) con su contexto. */
export async function captureFrame(
  video: HTMLVideoElement | null | undefined,
  reason: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  if (!debugOn || !video || video.readyState < 2 || shots >= MAX_SHOTS) return;
  const n = ++shots;
  const c = document.createElement("canvas");
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext("2d")?.drawImage(video, 0, 0);
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.92));
  if (!blob) return;
  const name = `${String(n).padStart(4, "0")}-${reason}.jpg`;
  dlog("shot", { name, reason, w: c.width, h: c.height, bytes: blob.size, ...extra });
  try {
    await post("file", blob, { name });
    sent++;
  } catch (e) {
    failed++;
    dlog("shot-error", { name, error: String(e) });
  }
  debugStats.onChange();
}

export function debugSummary(): string {
  return `depuración ${sid} · ${sent} fotos enviadas${failed ? ` · ${failed} fallidas` : ""}`;
}

if (debugOn) {
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: unknown };
  dlog("env", {
    ua: navigator.userAgent,
    uaData: nav.userAgentData,
    screen: [screen.width, screen.height],
    dpr: devicePixelRatio,
    cores: navigator.hardwareConcurrency,
    memory: nav.deviceMemory,
    lang: navigator.language,
    url: location.pathname,
  });
  addEventListener("error", (e) =>
    dlog("window-error", { message: e.message, src: `${e.filename}:${e.lineno}` }),
  );
  addEventListener("unhandledrejection", (e) => dlog("rejection", { reason: String(e.reason) }));
  setInterval(() => void flush(), 2000);
  addEventListener("visibilitychange", () => {
    dlog("visibility", { state: document.visibilityState });
    void flush();
  });
}
