// Subpath "@qhago/scanner/worker-host": para componer workers propios (p. ej. @qhago/ai, F5).
export { startWorkerHost } from "./worker/host";
export type { FromWorker, ToWorker } from "./worker/protocol";
