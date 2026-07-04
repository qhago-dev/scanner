/**
 * Capacitor plugin for ScanAI SDK.
 * Falls back to WASM when native implementation is not available.
 */

import { registerPlugin } from '@capacitor/core';

export interface ScanAIPlugin {
  start(config: ScanConfig): Promise<void>;
  stop(): Promise<void>;
  processImage(options: {
    data: string;
    width: number;
    height: number;
  }): Promise<{ result: BarcodeResult | null }>;
  addListener(
    event: string,
    callback: (data: any) => void
  ): Promise<PluginListenerHandle>;
}

export interface BarcodeResult {
  text: string;
  format: string;
  confidence: number;
  corners: { x: number; y: number }[];
  timestamp: number;
}

export interface ScanConfig {
  symbologies: string[];
  enableSuperResolution?: boolean;
  enableDeblur?: boolean;
  enablePerspectiveCorrection?: boolean;
  enableAutofocus?: boolean;
  enableTracking?: boolean;
  trackingSensitivity?: number;
  focusThreshold?: number;
  minConfidence?: number;
  scanIntervalMs?: number;
  maxResolutionWidth?: number;
}

export interface PluginListenerHandle {
  remove(): void;
}

const ScanAI = registerPlugin<ScanAIPlugin>('ScanAI', {
  web: async () => {
    const { AIScanner } = await import('@scanai/sdk');
    return new ScanAIWeb();
  },
});

class ScanAIWeb implements ScanAIPlugin {
  private scanner: any = null;
  private listeners: Map<string, ((data: any) => void)[]> = new Map();

  async start(config: ScanConfig): Promise<void> {
    const { AIScanner } = await import('@scanai/sdk');
    this.scanner = new AIScanner({ config });

    this.scanner.on('decode', (e: any) =>
      this.fireListeners('onDecode', e.data)
    );
    this.scanner.on('error', (e: any) =>
      this.fireListeners('onError', { message: e.message })
    );

    await this.scanner.start();
  }

  async stop(): Promise<void> {
    this.scanner?.stop();
  }

  async processImage(options: {
    data: string;
    width: number;
    height: number;
  }): Promise<{ result: BarcodeResult | null }> {
    const img = new Image();
    img.src = options.data;
    await new Promise((r) => (img.onload = r));

    const result = await this.scanner?.processImage(img);
    return { result: result ?? null };
  }

  async addListener(
    event: string,
    callback: (data: any) => void
  ): Promise<PluginListenerHandle> {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);

    return {
      remove: () => {
        const arr = this.listeners.get(event);
        if (arr) {
          const idx = arr.indexOf(callback);
          if (idx >= 0) arr.splice(idx, 1);
        }
      },
    };
  }

  private fireListeners(event: string, data: any): void {
    const arr = this.listeners.get(event);
    if (arr) {
      for (const cb of arr) {
        try {
          cb(data);
        } catch {}
      }
    }
  }
}

export { ScanAI };
export default ScanAI;
