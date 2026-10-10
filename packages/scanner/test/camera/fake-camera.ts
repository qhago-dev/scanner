// Cámara simulada para navegadores sin --use-fake-device-for-media-stream (Firefox/WebKit, F6.3):
// getUserMedia devuelve canvas.captureStream() con los frames del clip (test/.cache/ean13-moving/*.png),
// enumerateDevices expone 2 cámaras y permissions.query("camera") responde "granted".
const FRAMES = 30;

async function loadFrames(): Promise<ImageBitmap[]> {
  const out: ImageBitmap[] = [];
  for (let i = 1; i <= FRAMES; i++) {
    const name = String(i).padStart(3, "0");
    const res = await fetch(new URL(`../.cache/ean13-moving/${name}.png`, import.meta.url));
    out.push(await createImageBitmap(await res.blob()));
  }
  return out;
}

let frames: Promise<ImageBitmap[]> | null = null;

async function fakeStream(constraints?: MediaStreamConstraints): Promise<MediaStream> {
  frames ??= loadFrames();
  const list = await frames;
  const canvas = document.createElement("canvas");
  canvas.width = list[0]?.width ?? 640;
  canvas.height = list[0]?.height ?? 480;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  let i = 0;
  const draw = () => {
    ctx.fillStyle = "#e0e0e0";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(list[i++ % list.length] as ImageBitmap, 0, 0);
  };
  // Cambio de dimensiones en caliente (rotación del dispositivo, cambio de resolución).
  (globalThis as { __qhagoFakeCamera?: { resize(w: number, h: number): void } }).__qhagoFakeCamera =
    {
      resize(w, h) {
        canvas.width = w;
        canvas.height = h;
      },
    };
  draw();
  const timer = setInterval(draw, 1000 / 15);
  const stream = canvas.captureStream(15);
  const track = stream.getVideoTracks()[0] as MediaStreamTrack;
  const deviceId = (constraints?.video as MediaTrackConstraints | undefined)?.deviceId;
  const id =
    typeof deviceId === "string"
      ? deviceId
      : ((deviceId as { exact?: string })?.exact ?? "fake-back");
  Object.defineProperty(track, "label", {
    value: id === "fake-front" ? "Fake Front Camera" : "Fake Back Camera",
  });
  const settings = track.getSettings.bind(track);
  track.getSettings = () => ({
    ...settings(),
    deviceId: id,
    width: canvas.width,
    height: canvas.height,
  });
  track.getCapabilities = () => ({}) as MediaTrackCapabilities;
  track.addEventListener("ended", () => clearInterval(timer));
  const stop = track.stop.bind(track);
  track.stop = () => {
    clearInterval(timer);
    stop();
  };
  return stream;
}

export function installFakeCamera(): void {
  const md = navigator.mediaDevices as MediaDevices & { __fake?: boolean };
  if (!md || md.__fake) return;
  md.__fake = true;
  md.getUserMedia = fakeStream;
  md.enumerateDevices = async () =>
    [
      { deviceId: "fake-back", kind: "videoinput", label: "Fake Back Camera", groupId: "g1" },
      { deviceId: "fake-front", kind: "videoinput", label: "Fake Front Camera", groupId: "g2" },
    ].map((d) => ({ ...d, toJSON: () => d })) as MediaDeviceInfo[];
  if (navigator.permissions) {
    const q = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (async (d: PermissionDescriptor) =>
      d.name === ("camera" as PermissionName)
        ? ({ state: "granted", onchange: null } as PermissionStatus)
        : q(d)) as never;
  }
}

// Chromium usa la cámara falsa nativa (flags); el resto, este shim.
if (!/Chrome\//.test(navigator.userAgent)) installFakeCamera();
