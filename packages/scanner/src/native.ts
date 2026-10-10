import { ScanError } from "./errors";
import { DEFAULT_FORMATS, isBarcodeFormat } from "./formats";
import { type ImageInput, isRawImage } from "./input/common";
import type { BarcodeFormat, BarcodeResult, DecodeOptions, Point } from "./types";

interface NativeDetected {
  rawValue: string;
  format: string;
  boundingBox: DOMRectReadOnly;
  cornerPoints: Point[];
}
interface NativeDetector {
  detect(src: unknown): Promise<NativeDetected[]>;
}
interface NativeDetectorCtor {
  new (o?: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

function ctor(): NativeDetectorCtor | null {
  const g = globalThis as { BarcodeDetector?: NativeDetectorCtor & { __qhagoPolyfill?: boolean } };
  return g.BarcodeDetector && !g.BarcodeDetector.__qhagoPolyfill ? g.BarcodeDetector : null;
}

/** true si existe BarcodeDetector nativo y soporta todos los formatos pedidos. */
export async function nativeSupports(formats: readonly BarcodeFormat[]): Promise<boolean> {
  const C = ctor();
  if (!C) return false;
  try {
    const supported = new Set(await C.getSupportedFormats());
    return formats.every((f) => supported.has(f));
  } catch {
    return false;
  }
}

function toImageData(input: ImageInput): unknown {
  if (!isRawImage(input))
    return input instanceof ArrayBuffer || input instanceof Uint8Array
      ? new Blob([input as BlobPart])
      : input;
  if (input.format === "rgba")
    return new ImageData(new Uint8ClampedArray(input.data), input.width, input.height);
  const rgba = new Uint8ClampedArray(input.width * input.height * 4);
  for (let i = 0; i < input.width * input.height; i++) {
    const v = input.data[i] ?? 0;
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  return new ImageData(rgba, input.width, input.height);
}

export async function decodeNative(
  input: ImageInput,
  options: DecodeOptions,
): Promise<BarcodeResult[]> {
  const C = ctor();
  if (!C)
    throw new ScanError(
      "UNSUPPORTED",
      'engine: "native" requiere BarcodeDetector, que este navegador no tiene',
    );
  const formats = options.formats ?? DEFAULT_FORMATS;
  const found = await new C({ formats: [...formats] }).detect(toImageData(input));
  const enc = new TextEncoder();
  return found
    .filter((d) => isBarcodeFormat(d.format))
    .map((d) => {
      const c = d.cornerPoints;
      const p = (i: number): Point => ({ x: c[i]?.x ?? 0, y: c[i]?.y ?? 0 });
      const b = d.boundingBox;
      return {
        format: d.format as BarcodeFormat,
        text: d.rawValue,
        bytes: enc.encode(d.rawValue),
        cornerPoints: [p(0), p(1), p(2), p(3)],
        boundingBox: { x: b.x, y: b.y, width: b.width, height: b.height },
        orientation: 0,
        isMirrored: false,
        isInverted: false,
        contentType: "unknown",
        symbologyIdentifier: "",
        ecLevel: "",
        confidence: 1,
      };
    });
}
