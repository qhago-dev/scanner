// Modo depuración (servido por debug-server.ts): logs + fotogramas reales al servidor local, con feedback en pantalla.
// El token llega por ?debug= o lo inyecta debug-server.ts en <meta name="qhago-debug">.
const token =
  new URLSearchParams(location.search).get("debug") ??
  document.querySelector<HTMLMetaElement>('meta[name="qhago-debug"]')?.content ??
  null;
export const debugOn = !!token;
const sid = `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-${Math.random().toString(36).slice(2, 6)}`;
const t0 = performance.now();
const MAX_SHOTS = 300;
let queue: string[] = [];
let shots = 0;
let sent = 0;
let failed = 0;
let server = "comprobando…";
let lastShot = "";
let lastError = "";

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
  let r: Response;
  try {
    r = await fetch(`/debug/${path}?${q}`, {
      method: "POST",
      headers: { "x-debug-token": token ?? "" },
      body,
      keepalive: typeof body === "string" && body.length < 60_000,
    });
  } catch (e) {
    server = `sin conexión (${(e as Error).message})`;
    throw e;
  }
  if (!r.ok) {
    server = `rechazado: HTTP ${r.status} ${await r.text().catch(() => "")}`;
    throw new Error(`${path}: HTTP ${r.status}`);
  }
  server = "conectado ✓";
}

async function flush(): Promise<void> {
  if (!queue.length) return;
  const lines = queue;
  queue = [];
  try {
    await post("log", `${lines.join("\n")}\n`);
  } catch (e) {
    lastError = `log no enviado: ${(e as Error).message}`;
    queue = [...lines, ...queue].slice(-2000);
  }
}

// Motivos por los que no se guarda una foto: se anotan (como mucho uno cada 5 s por motivo) y se muestran.
const skipAt = new Map<string, number>();
function skip(reason: string, extra: Record<string, unknown> = {}): string {
  const now = performance.now();
  if (now - (skipAt.get(reason) ?? -1e9) > 5000) {
    skipAt.set(reason, now);
    dlog("shot-skip", { reason, ...extra });
  }
  lastError = `foto no guardada: ${reason}`;
  return reason;
}

/** Guarda el fotograma actual del vídeo a resolución nativa (JPEG 0,92). Devuelve el motivo si no se pudo. */
export async function captureFrame(
  video: HTMLVideoElement | null | undefined,
  reason: string,
  extra: Record<string, unknown> = {},
): Promise<string | null> {
  if (!debugOn) return "depuración desactivada";
  if (!video) return skip("no hay vídeo (cámara cerrada)");
  if (video.readyState < 2)
    return skip(`el vídeo aún no tiene imagen (readyState ${video.readyState})`);
  if (!video.videoWidth) return skip("el vídeo mide 0×0");
  if (shots >= MAX_SHOTS) return skip(`límite de ${MAX_SHOTS} fotos por sesión`);
  const n = ++shots;
  const c = document.createElement("canvas");
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  const ctx = c.getContext("2d");
  if (!ctx) return skip("canvas 2D no disponible");
  ctx.drawImage(video, 0, 0);
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.92));
  if (!blob) return skip("toBlob devolvió null");
  const name = `${String(n).padStart(4, "0")}-${reason}.jpg`;
  dlog("shot", { name, reason, w: c.width, h: c.height, bytes: blob.size, ...extra });
  try {
    await post("file", blob, { name });
    sent++;
    lastShot = `${name} ✓ ${(blob.size / 1024).toFixed(0)} KB (${c.width}×${c.height})`;
    lastError = "";
    return null;
  } catch (e) {
    failed++;
    lastError = `${name} no se envió: ${(e as Error).message}`;
    dlog("shot-error", { name, error: String(e) });
    return lastError;
  }
}

export interface DebugHooks {
  video: () => HTMLVideoElement | null | undefined;
  /** Contexto que acompaña cada foto (IA, enfoque, fps…). */
  info: () => Record<string, unknown>;
  /** Elemento que parpadea al tomar una foto. */
  flash?: () => HTMLElement | null | undefined;
}

/** Panel de depuración: botón, foto automática con cuenta atrás y estado del servidor. */
export function mountDebug(
  host: HTMLElement,
  hooks: DebugHooks,
): { noteDetect: (r: { format: string; text: string }) => void } {
  if (!debugOn) return { noteDetect: () => {} };
  host.hidden = false;
  host.innerHTML = `
    <div class="dbg-row">
      <button type="button" class="dbg-snap">📸 capturar</button>
      <label><input type="checkbox" class="dbg-auto" checked /> foto automática si no lee, cada</label>
      <select class="dbg-every"><option value="1000">1 s</option><option value="1500" selected>1,5 s</option><option value="3000">3 s</option><option value="5000">5 s</option></select>
    </div>
    <div class="dbg-next">—</div>
    <div class="dbg-info">—</div>
    <div class="dbg-err"></div>`;
  const q = <T extends HTMLElement>(s: string) => host.querySelector(s) as T;
  const auto = q<HTMLInputElement>(".dbg-auto");
  const every = q<HTMLSelectElement>(".dbg-every");
  let lastAuto = performance.now();
  let lastDetect = -1e9;
  let busy = false;

  const shoot = async (reason: string, extra: Record<string, unknown> = {}) => {
    const el = hooks.flash?.();
    el?.classList.add("dbg-flash");
    setTimeout(() => el?.classList.remove("dbg-flash"), 180);
    busy = true;
    await captureFrame(hooks.video(), reason, { ...hooks.info(), ...extra });
    busy = false;
  };
  q<HTMLButtonElement>(".dbg-snap").addEventListener("click", () => void shoot("manual"));
  for (const el of [auto, every])
    el.addEventListener("change", () =>
      dlog("auto-shot", { enabled: auto.checked, everyMs: Number(every.value) }),
    );

  setInterval(() => {
    const now = performance.now();
    const ms = Number(every.value);
    const v = hooks.video();
    let next: string;
    if (!auto.checked) next = "foto automática desactivada (usa 📸)";
    else if (!v || v.readyState < 2) next = "📸 esperando a que la cámara dé imagen…";
    else if (shots >= MAX_SHOTS) next = `límite de ${MAX_SHOTS} fotos alcanzado`;
    else if (now - lastDetect < ms)
      next = `✔ acaba de leer: la foto automática vuelve en ${((ms - (now - lastDetect)) / 1000).toFixed(1)} s`;
    else {
      const left = ms - (now - lastAuto);
      if (left <= 0 && !busy) {
        lastAuto = now;
        void shoot("miss", { sinceDetectMs: Math.round(now - lastDetect) });
      }
      next = `📸 próxima foto automática en ${(Math.max(0, left) / 1000).toFixed(1)} s (cada ${ms / 1000} s mientras no lea)`;
    }
    q(".dbg-next").textContent = next;
    q(".dbg-info").textContent =
      `servidor: ${server} · sesión ${sid} · ${sent} enviadas${failed ? ` · ${failed} fallidas` : ""}` +
      (lastShot ? ` · última: ${lastShot}` : "");
    q(".dbg-err").textContent = lastError;
  }, 200);

  return {
    noteDetect: (r) => {
      lastDetect = performance.now();
      void shoot("detect", { format: r.format, text: r.text });
    },
  };
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
    secure: isSecureContext,
  });
  addEventListener("error", (e) =>
    dlog("window-error", { message: e.message, src: `${e.filename}:${e.lineno}` }),
  );
  addEventListener("unhandledrejection", (e) => dlog("rejection", { reason: String(e.reason) }));
  void flush(); // primer contacto: confirma en pantalla que el servidor responde
  setInterval(() => void flush(), 2000);
  addEventListener("visibilitychange", () => {
    dlog("visibility", { state: document.visibilityState });
    void flush();
  });
}
