import { isLinear } from "../formats";
import type { BarcodeFormat, BarcodeResult, ContentType, DecodeCandidate, Point } from "../types";
import type { EngineModule } from "./module";
import { OPT_COUNT } from "./options";

/** Imagen lista para el motor. `stride` en bytes. */
export interface Raster {
  kind: "luma" | "rgba";
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  stride: number;
}

interface RawResult {
  format: BarcodeFormat;
  text: string;
  bytes: string;
  points: number[];
  orientation: number;
  mirrored: boolean;
  inverted: boolean;
  ecLevel: string;
  symbologyId: string;
  contentType: ContentType;
  lineCount: number;
  pass: string;
}

interface RawCandidate {
  format: BarcodeFormat;
  error: DecodeCandidate["error"];
  points: number[];
}

export interface EngineOutput {
  results: BarcodeResult[];
  candidates: DecodeCandidate[];
  passes: string[];
  budgetExceeded: boolean;
  ms: number;
}

const STRONG_1D = new Set<BarcodeFormat>(["ean_8", "ean_13", "upc_a", "upc_e", "code_128"]);

function corners(p: number[]): [Point, Point, Point, Point] {
  const pt = (i: number): Point => ({ x: p[2 * i] ?? 0, y: p[2 * i + 1] ?? 0 });
  return [pt(0), pt(1), pt(2), pt(3)];
}

function bbox(c: Point[]) {
  const xs = c.map((q) => q.x);
  const ys = c.map((q) => q.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function fromBase64(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/**
 * Heurística de confianza (documentada como tal). 2D: la corrección Reed-Solomon garantiza
 * integridad → 1. 1D: proporción de líneas de escaneo coincidentes, con suelo para checksum fuerte.
 */
export function confidenceOf(format: BarcodeFormat, lineCount: number): number {
  if (!isLinear(format)) return 1;
  const byLines = lineCount > 0 ? Math.min(1, lineCount / 4) : 0.5;
  return STRONG_1D.has(format) ? Math.max(0.5, byLines) : byLines;
}

const utf8 = new TextDecoder();

/**
 * Lee un string C del heap. No se usa el helper de texto del glue: con ALLOW_MEMORY_GROWTH Emscripten
 * usa un ArrayBuffer redimensionable y los navegadores rechazan TextDecoder.decode sobre sus vistas.
 */
function cString(m: EngineModule, ptr: number): string {
  const heap = m.HEAPU8;
  let end = ptr;
  while (heap[end] !== 0) end++;
  return utf8.decode(heap.slice(ptr, end));
}

export class Engine {
  constructor(private readonly m: EngineModule) {}

  read(r: Raster, opts: Int32Array): EngineOutput {
    const m = this.m;
    if (opts.length !== OPT_COUNT) throw new Error("opciones del motor con tamaño incorrecto");
    const rowBytes = r.kind === "rgba" ? r.width * 4 : r.width;
    const bytes = r.kind === "rgba" ? r.stride * r.height : r.width * r.height;
    const ptr = m._sa_alloc_input(bytes);
    // Con ALLOW_MEMORY_GROWTH las vistas se invalidan: leer m.HEAPU8 siempre después de reservar.
    const heap = m.HEAPU8;
    if (r.kind === "luma" && r.stride !== r.width) {
      for (let y = 0; y < r.height; y++)
        heap.set(r.data.subarray(y * r.stride, y * r.stride + rowBytes), ptr + y * r.width);
    } else {
      heap.set(r.data.subarray(0, bytes), ptr);
    }
    const optPtr = m._sa_options_ptr();
    new Int32Array(m.HEAPU8.buffer, optPtr, OPT_COUNT).set(opts);
    const n =
      r.kind === "rgba"
        ? m._sa_read_rgba(ptr, r.width, r.height, r.stride, optPtr)
        : m._sa_read(ptr, r.width, r.height, optPtr);
    return this.parse(n);
  }

  /** Solo build node: decodifica PNG/JPEG con stb_image y lee. */
  decodeEncoded(file: Uint8Array): Raster | null {
    const m = this.m;
    const ptr = m._sa_alloc_input(file.length);
    m.HEAPU8.set(file, ptr);
    const luma = m._sa_decode_image(ptr, file.length);
    if (!luma) return null;
    const width = m._sa_image_width();
    const height = m._sa_image_height();
    // Copia fuera del heap: el siguiente read reutiliza los buffers internos.
    return {
      kind: "luma",
      data: m.HEAPU8.slice(luma, luma + width * height),
      width,
      height,
      stride: width,
    };
  }

  lastError(): string {
    try {
      return (
        (JSON.parse(cString(this.m, this.m._sa_result_json())) as { error?: string }).error ?? ""
      );
    } catch {
      return "";
    }
  }

  private parse(n: number): EngineOutput {
    const json = JSON.parse(cString(this.m, this.m._sa_result_json())) as {
      error?: string;
      results?: RawResult[];
      candidates?: RawCandidate[];
      passes?: string[];
      budgetExceeded?: boolean;
      ms?: number;
    };
    if (n < 0 || json.error) throw new Error(json.error ?? "error del motor");
    return {
      results: (json.results ?? []).map((r) => {
        const c = corners(r.points);
        return {
          format: r.format,
          text: r.text,
          bytes: fromBase64(r.bytes),
          cornerPoints: c,
          boundingBox: bbox(c),
          orientation: r.orientation,
          isMirrored: r.mirrored,
          isInverted: r.inverted,
          contentType: r.contentType,
          symbologyIdentifier: r.symbologyId,
          ecLevel: r.ecLevel,
          confidence: confidenceOf(r.format, r.lineCount),
        };
      }),
      candidates: (json.candidates ?? []).map((c) => {
        const cp = corners(c.points);
        return { format: c.format, error: c.error, cornerPoints: cp, boundingBox: bbox(cp) };
      }),
      passes: json.passes ?? [],
      budgetExceeded: json.budgetExceeded ?? false,
      ms: json.ms ?? 0,
    };
  }
}
