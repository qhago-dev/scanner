// Opciones de cámara compartidas por las demos: modo de enfoque y distancia manual.
import { dlog } from "./debug";

type FocusCaps = MediaTrackCapabilities & {
  focusMode?: string[];
  focusDistance?: { min: number; max: number; step?: number };
};

/**
 * Aplica el modo de enfoque ("continuous" | "single-shot" | "manual" | "device") a la pista.
 * El scanner ya pone "continuous" al arrancar si existe. Devuelve un mensaje si no se pudo.
 */
export async function applyFocus(
  track: MediaStreamTrack | undefined,
  mode: string,
  dist: HTMLInputElement,
  distWrap: HTMLElement,
): Promise<string | null> {
  if (!track || mode === "device") return null;
  const caps = (track.getCapabilities?.() ?? {}) as FocusCaps;
  const fd = caps.focusDistance;
  distWrap.hidden = mode !== "manual" || !fd;
  dlog("capabilities", {
    caps: caps as unknown as Record<string, unknown>,
    settings: track.getSettings(),
  });
  if (!caps.focusMode?.includes(mode)) {
    const msg = `enfoque "${mode}" no soportado (modos: ${caps.focusMode?.join(", ") || "ninguno"})`;
    dlog("focus-unsupported", { mode, modes: caps.focusMode });
    return msg;
  }
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
  try {
    await track.applyConstraints({ advanced: [c] } as MediaTrackConstraints);
    return null;
  } catch (e) {
    dlog("focus-error", { message: (e as Error).message });
    return `no se pudo aplicar el enfoque: ${(e as Error).message}`;
  }
}

export function trackOf(video: HTMLVideoElement | null | undefined): MediaStreamTrack | undefined {
  return (video?.srcObject as MediaStream | null)?.getVideoTracks()[0];
}
