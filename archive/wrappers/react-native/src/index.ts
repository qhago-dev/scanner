/**
 * React Native wrapper for ScanAI SDK.
 * Uses native bridge to the Rust core library.
 */

import { NativeModules, Platform } from 'react-native';

const { ScanAIModule } = NativeModules;

export enum Symbology {
  Code128 = 'code128',
  Code39 = 'code39',
  Code93 = 'code93',
  Ean8 = 'ean8',
  Ean13 = 'ean13',
  UpcA = 'upca',
  UpcE = 'upce',
  Itf = 'itf',
  Codabar = 'codabar',
  QrCode = 'qr_code',
  DataMatrix = 'datamatrix',
  Pdf417 = 'pdf417',
  Aztec = 'aztec',
}

export interface BarcodeResult {
  text: string;
  format: string;
  confidence: number;
  corners: { x: number; y: number }[];
  timestamp: number;
}

export interface ScanConfig {
  symbologies: Symbology[];
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

export type ScanCallback = (result: BarcodeResult) => void;
export type ErrorCallback = (error: Error) => void;

export class AIScanner {
  private onDecodeCallback?: ScanCallback;
  private onErrorCallback?: ErrorCallback;

  set onDecode(callback: ScanCallback | undefined) {
    this.onDecodeCallback = callback;
  }

  set onError(callback: ErrorCallback | undefined) {
    this.onErrorCallback = callback;
  }

  async start(config?: Partial<ScanConfig>): Promise<void> {
    if (Platform.OS === 'web') {
      const { AIScanner: WebScanner } = await import('@scanai/sdk');
      this.webScanner = new WebScanner({ config });
      this.webScanner.on('decode', (e) => this.onDecodeCallback?.(e.data));
      this.webScanner.on('error', (e) => this.onErrorCallback?.(new Error(e.message)));
      await this.webScanner.start();
      return;
    }

    await ScanAIModule.start(config || {});

    ScanAIModule.addListener('onDecode', (result: BarcodeResult) => {
      this.onDecodeCallback?.(result);
    });

    ScanAIModule.addListener('onError', (error: { message: string }) => {
      this.onErrorCallback?.(new Error(error.message));
    });
  }

  async stop(): Promise<void> {
    if (Platform.OS === 'web') {
      this.webScanner?.stop();
      return;
    }
    await ScanAIModule.stop();
  }

  async processImage(
    imagePath: string
  ): Promise<BarcodeResult | null> {
    if (Platform.OS === 'web') {
      return this.webScanner?.processImage(imagePath) ?? null;
    }
    return ScanAIModule.processImage(imagePath);
  }

  private webScanner: any = null;
}
