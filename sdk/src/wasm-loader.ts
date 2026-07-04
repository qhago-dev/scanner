import { ScannerState } from "./types";

export class WasmLoader {
  private wasmModule: any = null;
  private worker: Worker | null = null;
  private wasmPath: string;
  private workerPath: string;
  private useWorker: boolean;

  constructor(wasmPath?: string, workerPath?: string) {
    this.wasmPath =
      wasmPath || "https://cdn.scanai.dev/wasm/scanai_core_bg.wasm";
    this.workerPath = workerPath || "";
    this.useWorker =
      typeof Worker !== "undefined" && !!this.workerPath;
  }

  async initialize(): Promise<void> {
    if (this.wasmModule) return;

    try {
      const wasm = await import(
        /* webpackChunkName: "scanai-core" */ "../../core/pkg/scanai_core.js"
      );
      await wasm.default(this.wasmPath);
      this.wasmModule = wasm;
    } catch (e) {
      try {
        const wasm = await import(
          /* webpackIgnore: true */ this.wasmPath
            .replace("_bg.wasm", ".js")
        );
        this.wasmModule = wasm;
      } catch (e2) {
        throw new Error(
          `Failed to load ScanAI WASM module. Ensure the WASM file is accessible at: ${this.wasmPath}`
        );
      }
    }
  }

  getScannerClass(): any {
    if (!this.wasmModule) {
      throw new Error(
        "WASM module not initialized. Call initialize() first."
      );
    }
    return this.wasmModule.AIScanner;
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.wasmModule = null;
  }
}
