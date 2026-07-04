import {
  AIScannerOptions,
  BarcodeResult,
  ModelConfig,
  ScanConfig,
  ScanEvent,
  ScanEventListener,
  ScannerState,
  Symbology,
} from "./types";

import { WasmLoader } from "./wasm-loader";

const DEFAULT_CONFIG: ScanConfig = {
  symbologies: Object.values(Symbology),
  enableSuperResolution: true,
  enableDeblur: true,
  enablePerspectiveCorrection: true,
  enableAutofocus: true,
  enableTracking: true,
  trackingSensitivity: 0.15,
  focusThreshold: 0.3,
  minConfidence: 0.5,
  scanIntervalMs: 100,
  maxResolutionWidth: 640,
};

const DEFAULT_MODEL_URLS: ModelConfig = {
  detectorUrl:
    "https://cdn.scanai.dev/models/v1/nanodet_barcode_int8.onnx",
  superResolutionUrl:
    "https://cdn.scanai.dev/models/v1/esrgan_tiny_int8.onnx",
  deblurUrl:
    "https://cdn.scanai.dev/models/v1/deblur_int8.onnx",
  perspectiveUrl:
    "https://cdn.scanai.dev/models/v1/perspective_corners.onnx",
  autofocusUrl:
    "https://cdn.scanai.dev/models/v1/autofocus_int8.onnx",
};

export class AIScanner {
  private config: ScanConfig;
  private modelConfig: ModelConfig;
  private state: ScannerState = ScannerState.Idle;
  private listeners: Map<string, ScanEventListener[]> = new Map();
  private wasm: WasmLoader;
  private wasmScanner: any = null;
  private animationFrameId: number | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private canvasCtx: CanvasRenderingContext2D | null = null;
  private lastScanTime: number = 0;

  constructor(options: AIScannerOptions = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.modelConfig = {
      ...DEFAULT_MODEL_URLS,
      ...options.models,
    };
    this.wasm = new WasmLoader(options.wasmPath, options.workerPath);
  }

  getState(): ScannerState {
    return this.state;
  }

  on(event: string, listener: ScanEventListener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);

    return () => {
      const arr = this.listeners.get(event);
      if (arr) {
        const idx = arr.indexOf(listener);
        if (idx >= 0) arr.splice(idx, 1);
      }
    };
  }

  once(event: string, listener: ScanEventListener): void {
    const wrapper: ScanEventListener = (e: ScanEvent) => {
      this.off(event, wrapper);
      listener(e);
    };
    this.on(event, wrapper);
  }

  off(event: string, listener: ScanEventListener): void {
    const arr = this.listeners.get(event);
    if (arr) {
      const idx = arr.indexOf(listener);
      if (idx >= 0) arr.splice(idx, 1);
    }
  }

  private emit(events: ScanEvent[]): void {
    for (const event of events) {
      const arr = this.listeners.get(event.type);
      if (arr) {
        for (const listener of arr) {
          try {
            listener(event);
          } catch (e) {
            console.error("ScanAI listener error:", e);
          }
        }
      }
    }
  }

  private emitSingle(event: ScanEvent): void {
    const arr = this.listeners.get(event.type);
    if (arr) {
      for (const listener of arr) {
        try {
          listener(event);
        } catch (e) {
          console.error("ScanAI listener error:", e);
        }
      }
    }
  }

  async start(): Promise<void> {
    if (this.state === ScannerState.Scanning) return;

    this.state = ScannerState.Loading;
    this.emitSingle({ type: "loading", progress: 0 });

    try {
      await this.wasm.initialize();
      this.emitSingle({ type: "loading", progress: 0.3 });

      const modelBytes = await this.downloadModels();
      this.emitSingle({ type: "loading", progress: 0.7 });

      const ScannerClass = this.wasm.getScannerClass();
      this.wasmScanner = new ScannerClass(this.config);

      await this.wasmScanner.load_models({
        detector_bytes: modelBytes.detector,
        super_resolution_bytes: modelBytes.superResolution,
        deblur_bytes: modelBytes.deblur,
        perspective_bytes: modelBytes.perspective,
        autofocus_bytes: modelBytes.autofocus,
        detector_url: undefined,
        super_resolution_url: undefined,
        deblur_url: undefined,
        perspective_url: undefined,
        autofocus_url: undefined,
      });

      this.state = ScannerState.Ready;
      this.emitSingle({ type: "ready" });
    } catch (e) {
      this.state = ScannerState.Error;
      this.emitSingle({
        type: "error",
        message: `Failed to start: ${e}`,
      });
      throw e;
    }
  }

  async attachCamera(
    videoElement: HTMLVideoElement,
    constraints?: MediaTrackConstraints
  ): Promise<void> {
    this.videoElement = videoElement;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: this.config.maxResolutionWidth },
        height: { ideal: this.config.maxResolutionWidth },
        ...constraints,
      },
      audio: false,
    });

    this.videoElement.srcObject = stream;
    await this.videoElement.play();

    this.canvasElement = document.createElement("canvas");
    this.canvasElement.width = this.config.maxResolutionWidth ?? 640;
    this.canvasElement.height =
      this.videoElement.videoHeight *
      (this.canvasElement.width / this.videoElement.videoWidth);
    this.canvasCtx = this.canvasElement.getContext("2d", {
      willReadFrequently: true,
    });

    this.startScanLoop();
  }

  private startScanLoop(): void {
    if (
      !this.videoElement ||
      !this.canvasElement ||
      !this.canvasCtx
    )
      return;

    this.state = ScannerState.Scanning;

    const loop = () => {
      const now = performance.now();
      const interval = this.config.scanIntervalMs ?? 100;

      if (now - this.lastScanTime >= interval) {
        this.lastScanTime = now;

        if (
          this.videoElement!.readyState ===
          this.videoElement!.HAVE_ENOUGH_DATA
        ) {
          const canvas = this.canvasElement!;
          const ctx = this.canvasCtx!;
          const video = this.videoElement!;

          canvas.width = this.config.maxResolutionWidth ?? 640;
          canvas.height =
            video.videoHeight *
            (canvas.width / video.videoWidth);

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
          );

          this.processFrame(
            imageData.data,
            canvas.width,
            canvas.height
          );
        }
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  private processFrame(
    data: Uint8ClampedArray,
    width: number,
    height: number
  ): void {
    if (!this.wasmScanner || this.state !== ScannerState.Scanning) {
      return;
    }

    try {
      const rawData = new Uint8Array(data);
      const eventsJson = this.wasmScanner.process_frame(
        rawData,
        width,
        height,
        "rgba8"
      );
      const events: ScanEvent[] = JSON.parse(eventsJson);
      this.emit(events);
    } catch (e) {
      this.emitSingle({
        type: "error",
        message: `Frame processing error: ${e}`,
      });
    }
  }

  async processImage(
    imageData: ImageData | HTMLImageElement | HTMLCanvasElement
  ): Promise<BarcodeResult | null> {
    if (!this.wasmScanner) {
      throw new Error("Scanner not initialized");
    }

    let data: Uint8ClampedArray;
    let width: number;
    let height: number;

    if (imageData instanceof ImageData) {
      data = imageData.data;
      width = imageData.width;
      height = imageData.height;
    } else {
      const canvas = document.createElement("canvas");
      canvas.width =
        imageData instanceof HTMLImageElement
          ? imageData.naturalWidth
          : imageData.width;
      canvas.height =
        imageData instanceof HTMLImageElement
          ? imageData.naturalHeight
          : imageData.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(imageData, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      data = imgData.data;
      width = imgData.width;
      height = imgData.height;
    }

    const rawData = new Uint8Array(data);
    const eventsJson = this.wasmScanner.process_frame(
      rawData,
      width,
      height,
      "rgba8"
    );
    const events: ScanEvent[] = JSON.parse(eventsJson);

    for (const event of events) {
      if (event.type === "decode") {
        return event.data;
      }
    }

    return null;
  }

  updateConfig(config: Partial<ScanConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.wasmScanner) {
      this.wasmScanner.update_config(this.config);
    }
  }

  stop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.videoElement?.srcObject) {
      const stream = this.videoElement.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      this.videoElement.srcObject = null;
    }

    this.state = ScannerState.Idle;
    this.wasmScanner = null;
  }

  destroy(): void {
    this.stop();
    this.listeners.clear();
    this.wasm.terminate();
  }

  private async downloadModels(): Promise<
    Record<string, Uint8Array | undefined>
  > {
    const downloads: Promise<[string, Uint8Array | undefined]>[] =
      [];

    const urlMap: Record<string, string | undefined> = {
      detector: this.modelConfig.detectorUrl,
      superResolution: this.modelConfig.superResolutionUrl,
      deblur: this.modelConfig.deblurUrl,
      perspective: this.modelConfig.perspectiveUrl,
      autofocus: this.modelConfig.autofocusUrl,
    };

    for (const [key, url] of Object.entries(urlMap)) {
      if (url) {
        downloads.push(
          this.fetchModel(url).then(
            (bytes) => [key, bytes] as [string, Uint8Array]
          )
        );
      } else {
        downloads.push(
          Promise.resolve([key, undefined] as [
            string,
            Uint8Array | undefined,
          ])
        );
      }
    }

    const results = await Promise.all(downloads);
    const modelBytes: Record<string, Uint8Array | undefined> = {};
    for (const [key, bytes] of results) {
      modelBytes[key] = bytes;
    }

    return modelBytes;
  }

  private async fetchModel(url: string): Promise<Uint8Array> {
    const cacheKey = `scanai-model:${url}`;

    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, version } = JSON.parse(cached);
        if (version === "1") {
          return new Uint8Array(data);
        }
      }
    } catch {}

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to download model from ${url}: ${response.status}`
      );
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    try {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          version: "1",
          data: Array.from(bytes),
        })
      );
    } catch {}

    return bytes;
  }
}
