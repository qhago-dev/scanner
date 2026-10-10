import { ScanError } from "../errors";

/** Versión del ABI que espera este JS (debe coincidir con kAbiVersion en el motor C++). */
export const ABI_VERSION = 2;

/** Superficie del módulo Emscripten (exports.txt + runtime). */
export interface EngineModule {
  HEAPU8: Uint8Array;
  _sa_abi_version(): number;
  _sa_alloc_input(bytes: number): number;
  _sa_options_ptr(): number;
  _sa_read(luma: number, w: number, h: number, opts: number): number;
  _sa_read_rgba(rgba: number, w: number, h: number, stride: number, opts: number): number;
  _sa_result_json(): number;
  _sa_quad_ptr(): number;
  _sa_read_quad(
    src: number,
    w: number,
    h: number,
    stride: number,
    channels: number,
    dstW: number,
    dstH: number,
    opts: number,
  ): number;
  _sa_decode_image(data: number, len: number): number;
  _sa_image_width(): number;
  _sa_image_height(): number;
  _sa_free(): void;
}

export type EngineFactory = (overrides: Record<string, unknown>) => Promise<EngineModule>;

/** Instancia el glue de Emscripten con un WebAssembly.Module ya compilado (se puede compartir entre workers). */
export async function instantiate(
  factory: EngineFactory,
  module: WebAssembly.Module,
): Promise<EngineModule> {
  let m: EngineModule;
  try {
    m = await factory({
      instantiateWasm(
        imports: WebAssembly.Imports,
        done: (i: WebAssembly.Instance, m: WebAssembly.Module) => void,
      ) {
        WebAssembly.instantiate(module, imports).then((inst) => done(inst, module));
        return {};
      },
    });
  } catch (e) {
    throw new ScanError("ENGINE_LOAD_FAILED", `No se pudo instanciar el motor WASM: ${String(e)}`, {
      cause: e,
    });
  }
  const abi = m._sa_abi_version();
  if (abi !== ABI_VERSION) {
    throw new ScanError(
      "ENGINE_LOAD_FAILED",
      `Versión del motor incompatible: el JS espera ABI ${ABI_VERSION} y el .wasm cargado es ABI ${abi}. ` +
        "Si usas wasmUrl (self-hosting/CDN), sirve el .wasm de la misma versión del paquete.",
    );
  }
  return m;
}
