import { ScanError } from "../errors";

export interface CameraInfo {
  deviceId: string;
  label: string;
  facing: "environment" | "user" | "unknown";
}

export interface CameraCapabilities {
  torch: boolean;
  zoom: { min: number; max: number; step: number } | null;
  focusContinuous: boolean;
}

type Caps = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: { min: number; max: number; step?: number };
  focusMode?: string[];
};

const BACK = /back|rear|environment|trasera|arrière|rück|posteriore|traseira|后|背面/i;
const FRONT = /front|user|facetime|frontal|avant|vorder|anteriore|前/i;
/** Solo descarta ultra gran angular / 0,5×. "Dual Wide"/"Triple" son la cámara principal en iOS. */
const ULTRA = /ultra[\s-]*wide|0[.,]5\s*x?|ultra/i;

export function facingOf(label: string): CameraInfo["facing"] {
  if (BACK.test(label)) return "environment";
  if (FRONT.test(label)) return "user";
  return "unknown";
}

export async function listCameras(): Promise<CameraInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devs = await navigator.mediaDevices.enumerateDevices();
  return devs
    .filter((d) => d.kind === "videoinput")
    .map((d) => ({ deviceId: d.deviceId, label: d.label, facing: facingOf(d.label) }));
}

/** Estado del permiso de cámara sin pedirlo ("unknown" si el navegador no lo expone). */
export async function getPermissionState(): Promise<PermissionState | "unknown"> {
  try {
    const s = await navigator.permissions?.query({ name: "camera" as PermissionName });
    return s?.state ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function capabilitiesOf(track: MediaStreamTrack): CameraCapabilities {
  const c = (track.getCapabilities?.() ?? {}) as Caps;
  return {
    torch: c.torch === true,
    zoom:
      c.zoom && c.zoom.max > c.zoom.min
        ? { min: c.zoom.min, max: c.zoom.max, step: c.zoom.step ?? 0.1 }
        : null,
    focusContinuous: c.focusMode?.includes("continuous") ?? false,
  };
}

/** Puntuación para elegir la cámara trasera principal (F3): capabilities primero, etiqueta después. */
export function scoreCamera(label: string, caps: Caps | null): number {
  if (ULTRA.test(label)) return -10;
  let s = facingOf(label) === "environment" ? 3 : facingOf(label) === "user" ? -5 : 0;
  if (caps?.focusMode?.includes("continuous")) s += 2;
  if (caps?.torch) s += 1;
  if (caps?.zoom && caps.zoom.max > 1) s += 1;
  return s;
}

/**
 * Tras el primer permiso (las etiquetas ya son visibles): ¿hay una cámara trasera mejor que la actual?
 * Usa InputDeviceInfo.getCapabilities() cuando existe (Chrome) y si no solo la etiqueta.
 */
export async function betterCamera(current: MediaStreamTrack): Promise<string | null> {
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter(
    (d) => d.kind === "videoinput",
  );
  if (devs.length < 2) return null;
  const curId = current.getSettings().deviceId;
  let best: { id: string; score: number } | null = null;
  for (const d of devs) {
    const caps = (d as InputDeviceInfo).getCapabilities?.() as Caps | undefined;
    const score =
      d.deviceId === curId
        ? scoreCamera(current.label, current.getCapabilities?.() as Caps)
        : scoreCamera(d.label, caps ?? null);
    if (!best || score > best.score) best = { id: d.deviceId, score };
  }
  return best && best.id !== curId ? best.id : null;
}

export function cameraError(e: unknown): ScanError {
  const name = (e as { name?: string })?.name;
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return new ScanError("PERMISSION_DENIED", "Permiso de cámara denegado", { cause: e });
    case "NotFoundError":
    case "OverconstrainedError":
    case "DevicesNotFoundError":
      return new ScanError("NO_CAMERA", "No se encontró una cámara compatible", { cause: e });
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return new ScanError(
        "CAMERA_IN_USE",
        "La cámara está en uso por otra aplicación o no se pudo iniciar",
        { cause: e },
      );
    default:
      return new ScanError(
        "UNSUPPORTED",
        `No se pudo abrir la cámara: ${String((e as Error)?.message ?? e)}`,
        { cause: e },
      );
  }
}

export interface OpenOptions {
  deviceId?: string;
  facingMode?: "environment" | "user";
  resolution: [number, number];
}

export async function openStream(o: OpenOptions): Promise<MediaStream> {
  if (typeof isSecureContext !== "undefined" && !isSecureContext) {
    throw new ScanError("INSECURE_CONTEXT", "La cámara solo está disponible en HTTPS o localhost");
  }
  if (!navigator.mediaDevices?.getUserMedia)
    throw new ScanError("UNSUPPORTED", "getUserMedia no está disponible");
  const [w, h] = o.resolution;
  const video: MediaTrackConstraints = {
    width: { ideal: w },
    height: { ideal: h },
    frameRate: { ideal: 30 },
    ...(o.deviceId
      ? { deviceId: { exact: o.deviceId } }
      : { facingMode: { ideal: o.facingMode ?? "environment" } }),
  };
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: false, video });
  } catch (e) {
    // deviceId recordado que ya no existe → reintentar sin él.
    if (
      o.deviceId &&
      ((e as Error).name === "OverconstrainedError" || (e as Error).name === "NotFoundError")
    ) {
      return openStream({ ...o, deviceId: undefined });
    }
    throw cameraError(e);
  }
}

export async function applyAdvanced(
  track: MediaStreamTrack,
  c: Record<string, unknown>,
): Promise<void> {
  await track.applyConstraints({ advanced: [c as MediaTrackConstraintSet] });
}
