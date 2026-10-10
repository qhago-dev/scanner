import { describe, expect, it } from "vitest";
import { ScanError, throwIfAborted } from "../../src/errors";
import {
  checkPixels,
  isImageDataLike,
  isRawImage,
  rawToRaster,
  sniff,
} from "../../src/input/common";

describe("entradas", () => {
  it("detecta RawImage e ImageData-like", () => {
    const raw = { data: new Uint8Array(4), width: 2, height: 2, format: "luma" as const };
    expect(isRawImage(raw)).toBe(true);
    expect(isImageDataLike(raw)).toBe(false);
    expect(isImageDataLike({ data: new Uint8ClampedArray(16), width: 2, height: 2 })).toBe(true);
    expect(isImageDataLike({ data: new Uint8ClampedArray(8), width: 2, height: 2 })).toBe(false);
  });
  it("rawToRaster valida dimensiones y tamaño", () => {
    expect(
      rawToRaster({ data: new Uint8Array(16), width: 2, height: 2, format: "rgba" }).stride,
    ).toBe(8);
    expect(() =>
      rawToRaster({ data: new Uint8Array(3), width: 2, height: 2, format: "luma" }),
    ).toThrow(ScanError);
    expect(() =>
      rawToRaster({ data: new Uint8Array(4), width: 0, height: 2, format: "luma" }),
    ).toThrow(/Dimensiones/);
  });
  it("checkPixels aplica maxInputPixels", () => {
    expect(() => checkPixels(5000, 4000)).toThrow(/maxInputPixels/);
    expect(() => checkPixels(4000, 4000)).not.toThrow();
  });
  it("sniff reconoce PNG, JPEG, WebP y GIF", () => {
    expect(sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("png");
    expect(sniff(new Uint8Array([0xff, 0xd8, 0xff]))).toBe("jpeg");
    expect(sniff(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45]))).toBe("webp");
    expect(sniff(new Uint8Array([0x47, 0x49, 0x46]))).toBe("gif");
    expect(sniff(new Uint8Array([1, 2, 3]))).toBe("unknown");
  });
});

describe("ScanError", () => {
  it("lleva code y docsUrl", () => {
    const e = new ScanError("NO_CAMERA", "x");
    expect(e.code).toBe("NO_CAMERA");
    expect(e.docsUrl).toMatch(/#no-camera$/);
    expect(e).toBeInstanceOf(Error);
  });
  it("throwIfAborted", () => {
    const c = new AbortController();
    expect(() => throwIfAborted(c.signal)).not.toThrow();
    c.abort();
    expect(() => throwIfAborted(c.signal)).toThrow(expect.objectContaining({ code: "ABORTED" }));
  });
});
