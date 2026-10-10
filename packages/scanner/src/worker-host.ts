// Subpath "@qhago/scanner/worker-host": para componer workers propios (p. ej. @qhago/ai, F5).
export type {
  PluginFrameContext,
  PluginOptions,
  PluginProposal,
  PluginRaster,
  ScannerPlugin,
  ScannerPluginFactory,
} from "./plugins";
export { PLUGIN_API_VERSION } from "./plugins";
export { startWorkerHost, type WorkerHostOptions } from "./worker/host";
export type { FromWorker, ToWorker } from "./worker/protocol";
