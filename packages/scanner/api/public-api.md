# API pública de @qhago/scanner

Generado por `scripts/api-report.ts`. No editar a mano: un cambio aquí es un cambio de API.

## @qhago/scanner

```ts
export interface AdvancedDecodeOptions {
    tryHarder: boolean;
    tryRotate: boolean;
    tryInvert: boolean;
    tryDownscale: boolean;
    binarizer: "local-average" | "global-histogram" | "fixed-threshold" | "bool-cast";
    isPure: boolean;
    eanAddOn: "ignore" | "read" | "require";
    minLineCount: number;
    preprocess: {
        clahe?: boolean;
        unsharp?: boolean;
        multiscale?: boolean;
        crops?: boolean;
    };
    textMode: "plain" | "hri" | "escaped" | "eci";
    deblurProposals: boolean;
}
export type BarcodeFormat = (typeof FORMATS)[number];
export interface BarcodeResult {
    format: BarcodeFormat;
    text: string;
    bytes: Uint8Array;
    cornerPoints: [
        Point,
        Point,
        Point,
        Point
    ];
    boundingBox: Rect;
    orientation: number;
    isMirrored: boolean;
    isInverted: boolean;
    contentType: ContentType;
    symbologyIdentifier: string;
    ecLevel: string;
    confidence: number;
}
export interface CameraCapabilities {
    torch: boolean;
    zoom: {
        min: number;
        max: number;
        step: number;
    } | null;
    focusContinuous: boolean;
}
export interface CameraInfo {
    deviceId: string;
    label: string;
    facing: "environment" | "user" | "unknown";
}
export function configure(next: EngineConfig): void;
export type ContentType = "text" | "binary" | "mixed" | "gs1" | "iso15434" | "unknown";
export function createScanner(options?: ScannerOptions): Scanner;
export function decode(input: ImageInput, options?: DecodeOptions & {
    includeErrors?: false;
}): Promise<BarcodeResult[]>;
export function decode(input: ImageInput, options: DecodeOptions & {
    includeErrors: true;
}): Promise<DecodeWithErrors>;
export function decode(input: ImageInput, options: DecodeAllOptions = {}): Promise<BarcodeResult[] | DecodeWithErrors>;
export interface DecodeCandidate {
    format: BarcodeFormat;
    cornerPoints: [
        Point,
        Point,
        Point,
        Point
    ];
    boundingBox: Rect;
    error: "checksum" | "format" | "unsupported";
}
export type DecodeEngine = "wasm" | "native" | "auto";
export interface DecodeOptions {
    formats?: readonly BarcodeFormat[];
    strategy?: DecodeStrategy;
    maxSymbols?: number;
    timeBudgetMs?: number;
    validateChecksums?: boolean | "strict";
    region?: Rect;
    maxInputPixels?: number;
    worker?: boolean;
    engine?: DecodeEngine;
    signal?: AbortSignal;
    advanced?: Partial<AdvancedDecodeOptions>;
    workerFactory?: () => Worker;
    plugins?: readonly ScannerPluginDescriptor[];
}
export type DecodeStrategy = "fast" | "balanced" | "thorough";
export interface DecodeWithErrors {
    results: BarcodeResult[];
    candidates: DecodeCandidate[];
}
const DEFAULT_FORMATS: readonly ("aztec" | "codabar" | "code_39" | "code_93" | "code_128" | "data_matrix" | "ean_8" | "ean_13" | "itf" | "pdf417" | "qr_code" | "upc_a" | "upc_e")[];
export interface EngineConfig {
    wasmUrl?: string | URL;
    wasmModule?: WebAssembly.Module;
    workerUrl?: string | URL;
    workerFactory?: () => Worker;
}
export interface EnvironmentReport {
    version: string;
    abi: number;
    runtime: "browser" | "worker" | "node" | "bun" | "deno" | "unknown";
    userAgent?: string;
    secureContext?: boolean;
    crossOriginIsolated?: boolean;
    hardwareConcurrency?: number;
    deviceMemory?: number;
    features: Record<string, boolean>;
    nativeFormats: string[];
    camera?: {
        permission: string;
        devices: number;
    };
    config: {
        wasmUrl?: string;
        workerUrl?: string;
        workerFactory: boolean;
    };
}
const FORMATS: readonly ["aztec", "codabar", "code_39", "code_93", "code_128", "data_matrix", "ean_8", "ean_13", "itf", "pdf417", "qr_code", "upc_a", "upc_e"];
export interface FusionOptions {
    confirmFrames: number | "auto";
    windowMs: number;
    duplicateCooldownMs: number;
}
export function getEnvironmentReport(): Promise<EnvironmentReport>;
export function getPermissionState(): Promise<PermissionState | "unknown">;
export type ImageInput = RawImage | ImageData | ImageBitmap | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | SVGImageElement | OffscreenCanvas | VideoFrame | Blob | ArrayBuffer | Uint8Array;
export function init(config?: EngineConfig & {
    signal?: AbortSignal;
}): Promise<void>;
export function isBarcodeFormat(v: unknown): v is BarcodeFormat;
export function isScanError(e: unknown): e is ScanError;
export function listCameras(): Promise<CameraInfo[]>;
export function mapPoints(points: readonly Point[], src: {
    width: number;
    height: number;
}, box: {
    width: number;
    height: number;
}, fit: ObjectFit = "contain", position: {
    x: number;
    y: number;
} = { x: 0.5, y: 0.5 }, mirrored = false): Point[];
export function mapToElement(points: readonly Point[], el: HTMLVideoElement, opts: {
    mirrored?: boolean;
} = {}): Point[];
export type ObjectFit = "cover" | "contain" | "fill" | "none" | "scale-down";
export interface Point {
    x: number;
    y: number;
}
export interface RawImage {
    data: Uint8Array | Uint8ClampedArray;
    width: number;
    height: number;
    format: "luma" | "rgba";
}
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export class ScanError extends Error {
    override readonly name: "ScanError";
    readonly code: ScanErrorCode;
    readonly docsUrl: string;
    constructor(code: ScanErrorCode, message: string, options?: {
        cause?: unknown;
    });
}
export type ScanErrorCode = "PERMISSION_DENIED" | "NO_CAMERA" | "CAMERA_IN_USE" | "INSECURE_CONTEXT" | "UNSUPPORTED" | "ENGINE_LOAD_FAILED" | "INVALID_INPUT" | "ABORTED";
export class Scanner {
    constructor(options: ScannerOptions = {});
    get state(): ScannerState;
    get video(): HTMLVideoElement | null;
    get route(): ScannerRoute | null;
    on<K extends ScannerEvent["type"]>(type: K, fn: Handler<K>): () => void;
    off<K extends ScannerEvent["type"]>(type: K, fn: Handler<K>): void;
    start(options?: {
        signal?: AbortSignal;
    }): Promise<void>;
    pause(): void;
    resume(): void;
    stop(): Promise<void>;
    destroy(): void;
    getCapabilities(): CameraCapabilities;
    setTorch(on: boolean): Promise<void>;
    setZoom(zoom: number): Promise<void>;
    listCameras(): Promise<CameraInfo[]>;
    switchCamera(deviceId: string): Promise<void>;
}
export type ScannerEvent = {
    type: "detect";
    result: TrackedResult;
} | {
    type: "candidate";
    result: TrackedResult;
} | {
    type: "track";
    result: TrackedResult;
} | {
    type: "lost";
    trackId: number;
} | {
    type: "frame";
    fps: number;
    ms: number;
    passes: string[];
} | {
    type: "state";
    state: ScannerState;
} | {
    type: "error";
    error: import("../errors").ScanError;
};
export interface ScannerOptions {
    video?: HTMLVideoElement;
    stream?: MediaStream;
    ownStream?: boolean;
    formats?: readonly BarcodeFormat[];
    roi?: Rect | "full";
    strategy?: DecodeStrategy;
    fusion?: Partial<FusionOptions>;
    camera?: {
        deviceId?: string;
        facingMode?: "environment" | "user";
        resolution?: [
            number,
            number
        ];
        rememberCamera?: boolean;
    };
    worker?: boolean;
    maxFps?: number;
    escalateAfterFrames?: number;
    processingWidth?: number | "native";
    maxCodes?: number;
    validateChecksums?: boolean | "strict";
    lostAfterMs?: number;
    frameStats?: boolean;
    route?: "auto" | "track-processor" | "frame-callback" | "inline";
    workerFactory?: () => Worker;
    plugins?: readonly ScannerPluginDescriptor[];
}
export interface ScannerPluginDescriptor {
    name: string;
    apiVersion: 1;
    options?: Record<string, string | number | boolean | null>;
}
export type ScannerRoute = "track-processor" | "frame-callback" | "inline";
export type ScannerState = "idle" | "starting" | "scanning" | "paused" | "stopped" | "destroyed" | "error";
export interface TrackedResult extends BarcodeResult {
    trackId: number;
    votes: number;
    firstSeen: number;
    lastSeen: number;
}
```

## @qhago/scanner (node)

```ts
export interface AdvancedDecodeOptions {
    tryHarder: boolean;
    tryRotate: boolean;
    tryInvert: boolean;
    tryDownscale: boolean;
    binarizer: "local-average" | "global-histogram" | "fixed-threshold" | "bool-cast";
    isPure: boolean;
    eanAddOn: "ignore" | "read" | "require";
    minLineCount: number;
    preprocess: {
        clahe?: boolean;
        unsharp?: boolean;
        multiscale?: boolean;
        crops?: boolean;
    };
    textMode: "plain" | "hri" | "escaped" | "eci";
    deblurProposals: boolean;
}
export type BarcodeFormat = (typeof FORMATS)[number];
export interface BarcodeResult {
    format: BarcodeFormat;
    text: string;
    bytes: Uint8Array;
    cornerPoints: [
        Point,
        Point,
        Point,
        Point
    ];
    boundingBox: Rect;
    orientation: number;
    isMirrored: boolean;
    isInverted: boolean;
    contentType: ContentType;
    symbologyIdentifier: string;
    ecLevel: string;
    confidence: number;
}
export function configure(next: EngineConfig): void;
export type ContentType = "text" | "binary" | "mixed" | "gs1" | "iso15434" | "unknown";
export function createScanner(): never;
export function decode(input: ImageInput, options?: DecodeOptions & {
    includeErrors?: false;
}): Promise<BarcodeResult[]>;
export function decode(input: ImageInput, options: DecodeOptions & {
    includeErrors: true;
}): Promise<DecodeWithErrors>;
export function decode(input: ImageInput, options: DecodeAllOptions = {}): Promise<BarcodeResult[] | DecodeWithErrors>;
export interface DecodeCandidate {
    format: BarcodeFormat;
    cornerPoints: [
        Point,
        Point,
        Point,
        Point
    ];
    boundingBox: Rect;
    error: "checksum" | "format" | "unsupported";
}
export type DecodeEngine = "wasm" | "native" | "auto";
export interface DecodeOptions {
    formats?: readonly BarcodeFormat[];
    strategy?: DecodeStrategy;
    maxSymbols?: number;
    timeBudgetMs?: number;
    validateChecksums?: boolean | "strict";
    region?: Rect;
    maxInputPixels?: number;
    worker?: boolean;
    engine?: DecodeEngine;
    signal?: AbortSignal;
    advanced?: Partial<AdvancedDecodeOptions>;
    workerFactory?: () => Worker;
    plugins?: readonly ScannerPluginDescriptor[];
}
export type DecodeStrategy = "fast" | "balanced" | "thorough";
export interface DecodeWithErrors {
    results: BarcodeResult[];
    candidates: DecodeCandidate[];
}
const DEFAULT_FORMATS: readonly ("aztec" | "codabar" | "code_39" | "code_93" | "code_128" | "data_matrix" | "ean_8" | "ean_13" | "itf" | "pdf417" | "qr_code" | "upc_a" | "upc_e")[];
export interface EngineConfig {
    wasmUrl?: string | URL;
    wasmModule?: WebAssembly.Module;
    workerUrl?: string | URL;
    workerFactory?: () => Worker;
}
export interface EnvironmentReport {
    version: string;
    abi: number;
    runtime: "browser" | "worker" | "node" | "bun" | "deno" | "unknown";
    userAgent?: string;
    secureContext?: boolean;
    crossOriginIsolated?: boolean;
    hardwareConcurrency?: number;
    deviceMemory?: number;
    features: Record<string, boolean>;
    nativeFormats: string[];
    camera?: {
        permission: string;
        devices: number;
    };
    config: {
        wasmUrl?: string;
        workerUrl?: string;
        workerFactory: boolean;
    };
}
const FORMATS: readonly ["aztec", "codabar", "code_39", "code_93", "code_128", "data_matrix", "ean_8", "ean_13", "itf", "pdf417", "qr_code", "upc_a", "upc_e"];
export interface FusionOptions {
    confirmFrames: number | "auto";
    windowMs: number;
    duplicateCooldownMs: number;
}
export function getEnvironmentReport(): Promise<EnvironmentReport>;
export type ImageInput = RawImage | ImageData | ImageBitmap | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | SVGImageElement | OffscreenCanvas | VideoFrame | Blob | ArrayBuffer | Uint8Array;
export function init(config?: EngineConfig & {
    signal?: AbortSignal;
}): Promise<void>;
export function isBarcodeFormat(v: unknown): v is BarcodeFormat;
export function isScanError(e: unknown): e is ScanError;
export function mapPoints(points: readonly Point[], src: {
    width: number;
    height: number;
}, box: {
    width: number;
    height: number;
}, fit: ObjectFit = "contain", position: {
    x: number;
    y: number;
} = { x: 0.5, y: 0.5 }, mirrored = false): Point[];
export function mapToElement(points: readonly Point[], el: HTMLVideoElement, opts: {
    mirrored?: boolean;
} = {}): Point[];
export type ObjectFit = "cover" | "contain" | "fill" | "none" | "scale-down";
export interface Point {
    x: number;
    y: number;
}
export interface RawImage {
    data: Uint8Array | Uint8ClampedArray;
    width: number;
    height: number;
    format: "luma" | "rgba";
}
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export class ScanError extends Error {
    override readonly name: "ScanError";
    readonly code: ScanErrorCode;
    readonly docsUrl: string;
    constructor(code: ScanErrorCode, message: string, options?: {
        cause?: unknown;
    });
}
export type ScanErrorCode = "PERMISSION_DENIED" | "NO_CAMERA" | "CAMERA_IN_USE" | "INSECURE_CONTEXT" | "UNSUPPORTED" | "ENGINE_LOAD_FAILED" | "INVALID_INPUT" | "ABORTED";
export type ScannerEvent = {
    type: "detect";
    result: TrackedResult;
} | {
    type: "candidate";
    result: TrackedResult;
} | {
    type: "track";
    result: TrackedResult;
} | {
    type: "lost";
    trackId: number;
} | {
    type: "frame";
    fps: number;
    ms: number;
    passes: string[];
} | {
    type: "state";
    state: ScannerState;
} | {
    type: "error";
    error: import("../errors").ScanError;
};
export interface ScannerPluginDescriptor {
    name: string;
    apiVersion: 1;
    options?: Record<string, string | number | boolean | null>;
}
export type ScannerState = "idle" | "starting" | "scanning" | "paused" | "stopped" | "destroyed" | "error";
export interface TrackedResult extends BarcodeResult {
    trackId: number;
    votes: number;
    firstSeen: number;
    lastSeen: number;
}
```

## @qhago/scanner/polyfill

```ts
export class BarcodeDetectorPolyfill {
    static readonly __qhagoPolyfill: true;
    static getSupportedFormats(): Promise<BarcodeFormat[]>;
    constructor(options?: {
        formats?: string[];
    });
    detect(image: ImageBitmapSource | Blob | VideoFrame): Promise<DetectedBarcode[]>;
}
export interface DetectedBarcode {
    boundingBox: DOMRectReadOnly;
    cornerPoints: Point[];
    format: BarcodeFormat;
    rawValue: string;
}
export function installPolyfill(opts: {
    force?: boolean;
} = {}): void;
```

## @qhago/scanner/parsers

```ts
export interface AAMVAData {
    iin: string;
    version: number;
    jurisdictionVersion: number;
    subfiles: Record<string, Record<string, string>>;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    dateOfBirth?: string;
    expiry?: string;
    issueDate?: string;
    sex?: "M" | "F" | "X";
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    documentNumber?: string;
}
export function gs1CheckDigit(digits: string): number;
export interface GS1Data {
    elements: GS1Element[];
    ais: Record<string, string>;
    gtin?: string;
    sscc?: string;
    batch?: string;
    serial?: string;
    expiry?: string;
    bestBefore?: string;
    productionDate?: string;
    netWeightKg?: number;
    count?: number;
    errors: string[];
}
export interface GS1Element {
    ai: string;
    title: string;
    value: string;
}
export function isAAMVA(text: string): boolean;
export function isISO15434(text: string): boolean;
export interface ISO15434Envelope {
    format: string;
    elements: {
        di?: string;
        value: string;
    }[];
    gs1?: GS1Data;
}
export function parseAAMVA(text: string): AAMVAData | null;
export function parseGS1(input: string): GS1Data;
export function parseISO15434(text: string): ISO15434Envelope[] | null;
export function parseQRContent(text: string): QRContent;
export type QRContent = {
    type: "url";
    url: string;
} | {
    type: "wifi";
    ssid: string;
    password?: string;
    security: "WPA" | "WEP" | "nopass" | string;
    hidden: boolean;
} | {
    type: "vcard";
    name?: string;
    org?: string;
    title?: string;
    phones: string[];
    emails: string[];
    urls: string[];
    address?: string;
    note?: string;
    fields: Record<string, string[]>;
} | {
    type: "mecard";
    name?: string;
    phones: string[];
    emails: string[];
    urls: string[];
    address?: string;
    note?: string;
} | {
    type: "geo";
    lat: number;
    lon: number;
    alt?: number;
    query?: string;
} | {
    type: "tel";
    number: string;
} | {
    type: "email";
    to: string;
    subject?: string;
    body?: string;
    cc?: string;
} | {
    type: "sms";
    number: string;
    body?: string;
} | {
    type: "text";
    text: string;
};
```

## @qhago/scanner/quagga-compat

```ts
const Quagga: {    init: (cfg: QuaggaJSConfigObject, cb?: ((err?: unknown) => void) | undefined) => Promise<void>;    start: () => void;    stop: () => Promise<void>;    pause: () => void;    decodeSingle: (cfg: QuaggaJSConfigObject, cb?: ((r: QuaggaJSResultObject | undefined) => void) | undefined) => Promise<QuaggaJSResultObject | undefined>;    onDetected: (cb: Cb) => undefined;    offDetected: (cb?: Cb | undefined) => undefined;    onProcessed: (cb: ProcessedCb) => undefined;    offProcessed: (cb?: ProcessedCb | undefined) => undefined;    setReaders(readers: ReaderSpec[]): void;    registerReader(name: string): void;    canvas: {        ctx: {            image: CanvasRenderingContext2D | null;            overlay: CanvasRenderingContext2D | null;        };        dom: {            image: HTMLCanvasElement | null;            overlay: HTMLCanvasElement | null;        };    };    ImageDebug: {        drawPath: (path: (Point | XY)[], def: {            x: string | number;            y: string | number;        }, ctx: CanvasRenderingContext2D, style: {            color?: string | undefined;            lineWidth?: number | undefined;        }) => void;        drawRect: (pos: Point, size: Point, ctx: CanvasRenderingContext2D, style: {            color?: string | undefined;            lineWidth?: number | undefined;        }) => void;    };    CameraAccess: {        request(video: HTMLVideoElement | null, constraints?: MediaTrackConstraints | undefined): Promise<void>;        release(): Promise<void>;        enumerateVideoDevices(): Promise<MediaDeviceInfo[]>;        getActiveTrack(): MediaStreamTrack | null;        getActiveStreamLabel(): string;        enableTorch(): Promise<void>;        disableTorch(): Promise<void>;    };    readonly scanner: Scanner | null;};
export function isValidVin(v: string): boolean;
const Quagga: {    init: (cfg: QuaggaJSConfigObject, cb?: ((err?: unknown) => void) | undefined) => Promise<void>;    start: () => void;    stop: () => Promise<void>;    pause: () => void;    decodeSingle: (cfg: QuaggaJSConfigObject, cb?: ((r: QuaggaJSResultObject | undefined) => void) | undefined) => Promise<QuaggaJSResultObject | undefined>;    onDetected: (cb: Cb) => undefined;    offDetected: (cb?: Cb | undefined) => undefined;    onProcessed: (cb: ProcessedCb) => undefined;    offProcessed: (cb?: ProcessedCb | undefined) => undefined;    setReaders(readers: ReaderSpec[]): void;    registerReader(name: string): void;    canvas: {        ctx: {            image: CanvasRenderingContext2D | null;            overlay: CanvasRenderingContext2D | null;        };        dom: {            image: HTMLCanvasElement | null;            overlay: HTMLCanvasElement | null;        };    };    ImageDebug: {        drawPath: (path: (Point | XY)[], def: {            x: string | number;            y: string | number;        }, ctx: CanvasRenderingContext2D, style: {            color?: string | undefined;            lineWidth?: number | undefined;        }) => void;        drawRect: (pos: Point, size: Point, ctx: CanvasRenderingContext2D, style: {            color?: string | undefined;            lineWidth?: number | undefined;        }) => void;    };    CameraAccess: {        request(video: HTMLVideoElement | null, constraints?: MediaTrackConstraints | undefined): Promise<void>;        release(): Promise<void>;        enumerateVideoDevices(): Promise<MediaDeviceInfo[]>;        getActiveTrack(): MediaStreamTrack | null;        getActiveStreamLabel(): string;        enableTorch(): Promise<void>;        disableTorch(): Promise<void>;    };    readonly scanner: Scanner | null;};
export interface QuaggaJSCodeResult {
    code: string;
    format: string;
    start?: number;
    end?: number;
    startInfo: Record<string, unknown>;
    decodedCodes: unknown[];
    direction?: number;
}
export interface QuaggaJSConfigObject {
    inputStream?: {
        name?: string;
        type?: "LiveStream" | "ImageStream" | "VideoStream";
        target?: Element | string | null;
        constraints?: MediaTrackConstraints & {
            width?: number | ConstrainULong;
            height?: number | ConstrainULong;
        };
        area?: {
            top?: string;
            right?: string;
            left?: string;
            bottom?: string;
            borderColor?: string;
            borderWidth?: number;
            backgroundColor?: string;
        };
        singleChannel?: boolean;
        size?: number;
    };
    decoder?: {
        readers?: ReaderSpec[];
        debug?: unknown;
        multiple?: boolean;
    };
    locator?: {
        halfSample?: boolean;
        patchSize?: string;
        debug?: unknown;
        willReadFrequently?: boolean;
    };
    locate?: boolean;
    numOfWorkers?: number;
    frequency?: number;
    debug?: unknown;
    src?: string;
}
export interface QuaggaJSResultObject {
    codeResult: QuaggaJSCodeResult;
    box: XY[];
    boxes: XY[][];
    line: Point[];
    angle?: number;
    pattern?: number[];
}
```

## @qhago/scanner/ui

```ts
const LABELS: Record<"es" | "en", QhagoScannerLabels>;
export class QhagoScannerElement extends Base {
    static observedAttributes: string[];
    labels: Partial<QhagoScannerLabels>;
    options: Omit<ScannerOptions, "video" | "formats" | "roi">;
    get scanner(): Scanner | null;
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(name: string, old: string | null, val: string | null): void;
    start(): Promise<void>;
    pause(): void;
    stop(): Promise<void>;
}
export interface QhagoScannerLabels {
    start: string;
    stop: string;
    torchOn: string;
    torchOff: string;
    switchCamera: string;
    scanning: string;
    read: string;
    error: string;
}
```

## @qhago/scanner/worker-host

```ts
export type FromWorker = {
    t: "ready";
    plugins?: string[];
} | {
    t: "result";
    id: number;
    value: BarcodeResult[] | DecodeWithErrors;
} | {
    t: "error";
    id: number;
    code: ScanErrorCode;
    message: string;
} | {
    t: "done";
    sid: number;
    id: number;
    ms: number;
    passes: string[];
} | {
    t: "event";
    sid: number;
    event: WireEvent;
};
const PLUGIN_API_VERSION: 1;
export interface PluginFrameContext {
    framesWithoutRead: number;
    source: "image" | "video";
}
export type PluginOptions = NonNullable<ScannerPluginDescriptor["options"]>;
export interface PluginProposal {
    quad: readonly [
        Point,
        Point,
        Point,
        Point
    ];
    formats?: readonly BarcodeFormat[];
    score: number;
}
export type PluginRaster = Readonly<Raster>;
export interface ScannerPlugin {
    readonly name: string;
    readonly when?: "fallback" | "always";
    onFrame(raster: PluginRaster, ctx: PluginFrameContext): Promise<PluginProposal[]>;
    dispose?(): void;
}
export type ScannerPluginFactory = (options: PluginOptions) => ScannerPlugin | Promise<ScannerPlugin>;
export function startWorkerHost(options: WorkerHostOptions = {}): void;
export type ToWorker = {
    t: "init";
    wasmModule: WebAssembly.Module;
} | {
    t: "decode";
    id: number;
    input: ImageInput;
    options: WireOptions;
} | {
    t: "open";
    sid: number;
    options: ScannerWorkerOptions;
} | {
    t: "config";
    sid: number;
    options: Partial<ScannerWorkerOptions>;
} | {
    t: "stream";
    sid: number;
    readable: ReadableStream<VideoFrame>;
    srcWidth: number;
    srcHeight: number;
    maxFps: number;
} | {
    t: "frame";
    sid: number;
    id: number;
    frame: ImageBitmap | VideoFrame;
    meta: FrameMeta;
} | {
    t: "source";
    sid: number;
    srcWidth: number;
    srcHeight: number;
} | {
    t: "pause";
    sid: number;
} | {
    t: "resume";
    sid: number;
} | {
    t: "close";
    sid: number;
};
export interface WorkerHostOptions {
    port?: Port;
    plugins?: Record<string, ScannerPluginFactory>;
}
```
