/** Códigos de error públicos (F2.0). La unión es estable desde 1.0. */
export type ScanErrorCode =
  | "PERMISSION_DENIED"
  | "NO_CAMERA"
  | "CAMERA_IN_USE"
  | "INSECURE_CONTEXT"
  | "UNSUPPORTED"
  | "ENGINE_LOAD_FAILED"
  | "INVALID_INPUT"
  | "ABORTED";

const DOCS = "https://qhago.dev/docs/errors";

/** Error tipado de la librería. Toda API pública lanza `ScanError` (salvo el polyfill, que sigue la spec). */
export class ScanError extends Error {
  override readonly name = "ScanError";
  readonly code: ScanErrorCode;
  readonly docsUrl: string;

  constructor(code: ScanErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.docsUrl = `${DOCS}#${code.toLowerCase().replaceAll("_", "-")}`;
  }
}

export function isScanError(e: unknown): e is ScanError {
  return e instanceof ScanError;
}

/** Lanza ABORTED si la señal ya está abortada. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted)
    throw new ScanError("ABORTED", "Operación abortada", { cause: signal.reason });
}
