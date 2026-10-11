// Host del worker: decode() y sesiones de escaneo. Se exporta como "@qhago/scanner/worker-host"
// para que otros paquetes (p. ej. @qhago/ai) compongan su propio worker (F5).

import { configure } from "../config";
import { decodeInline } from "../core";
import { isScanError } from "../errors";
import { browserPlatform } from "../platform-browser";
import { PluginRegistry, type ScannerPluginFactory } from "../plugins";
import { Scheduler } from "../scanner/scheduler";
import { ScannerSession } from "../scanner/session";
import type { FromWorker, ToWorker } from "./protocol";

interface Port {
  postMessage(m: FromWorker, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
}

interface StreamState {
  reader: ReadableStreamDefaultReader<VideoFrame>;
  busy: boolean;
  paused: boolean;
  srcWidth: number;
  srcHeight: number;
  /** Mismo ritmo que el hilo principal (ruta 2): mediana del coste, acotado entre maxFps y 4 fps. */
  sched: Scheduler;
}

export interface WorkerHostOptions {
  /** Default: el scope global del worker. */
  port?: Port;
  /** Plugins que este worker sabe ejecutar, por nombre de descriptor (p. ej. { "ai-detector": factory }). */
  plugins?: Record<string, ScannerPluginFactory>;
}

export function startWorkerHost(options: WorkerHostOptions = {}): void {
  const port = options.port ?? (self as unknown as Port);
  const registry = new PluginRegistry(options.plugins);
  const sessions = new Map<number, ScannerSession>();
  const streams = new Map<number, StreamState>();
  const post = (m: FromWorker) => port.postMessage(m);

  // Ruta 1: frames por ReadableStream; si el anterior aún se procesa, el nuevo se descarta (back-pressure).
  async function pump(sid: number, st: StreamState) {
    for (;;) {
      const { value: frame, done } = await st.reader
        .read()
        .catch(() => ({ value: undefined, done: true }));
      if (done || !frame) return;
      const now = performance.now();
      const session = sessions.get(sid);
      if (!session || st.paused || st.busy || !st.sched.canSend(now)) {
        frame.close();
        continue;
      }
      st.busy = true;
      st.sched.sent(now);
      let ms = 0;
      session
        .process(frame, {
          ts: now,
          srcWidth: st.srcWidth || frame.displayWidth,
          srcHeight: st.srcHeight || frame.displayHeight,
        })
        .then((r) => {
          ms = r.ms;
          post({ t: "done", sid, id: -1, ms: r.ms, passes: r.passes });
        })
        .finally(() => {
          frame.close();
          // Antes: minInterval = max(minInterval, 1,2·EMA), que solo podía crecer: un frame lento (carga del
          // modelo IA, un barrido) dejaba la cámara a < 1 fps el resto de la sesión (medido en Android).
          st.sched.done(ms);
          st.busy = false;
        });
    }
  }

  port.onmessage = async (e: MessageEvent<ToWorker>) => {
    const m = e.data;
    switch (m.t) {
      case "init":
        configure({ wasmModule: m.wasmModule });
        post({ t: "ready", plugins: registry.names() });
        return;
      case "decode":
        try {
          const value = await decodeInline(
            browserPlatform,
            m.input,
            { ...m.options, worker: false },
            registry,
          );
          post({ t: "result", id: m.id, value });
        } catch (err) {
          post({
            t: "error",
            id: m.id,
            code: isScanError(err) ? err.code : "INVALID_INPUT",
            message: err instanceof Error ? err.message : String(err),
          });
        } finally {
          const i = m.input as unknown;
          if (typeof VideoFrame === "function" && i instanceof VideoFrame) i.close();
          else if (typeof ImageBitmap === "function" && i instanceof ImageBitmap) i.close();
        }
        return;
      case "open":
        sessions.set(
          m.sid,
          new ScannerSession(
            m.options,
            browserPlatform,
            (event) => post({ t: "event", sid: m.sid, event }),
            registry,
          ),
        );
        return;
      case "config":
        sessions.get(m.sid)?.configure(m.options);
        return;
      case "stream": {
        const st: StreamState = {
          reader: m.readable.getReader(),
          busy: false,
          paused: false,
          srcWidth: m.srcWidth,
          srcHeight: m.srcHeight,
          sched: new Scheduler(Math.max(1, m.maxFps)),
        };
        streams.set(m.sid, st);
        void pump(m.sid, st);
        return;
      }
      case "frame": {
        const s = sessions.get(m.sid);
        try {
          const r = s ? await s.process(m.frame, m.meta) : { ms: 0, passes: [] };
          post({ t: "done", sid: m.sid, id: m.id, ms: r.ms, passes: r.passes });
        } finally {
          m.frame.close();
        }
        return;
      }
      case "source": {
        sessions.get(m.sid)?.resetTracking();
        const st = streams.get(m.sid);
        if (st) {
          st.srcWidth = m.srcWidth;
          st.srcHeight = m.srcHeight;
        }
        return;
      }
      case "pause":
      case "resume": {
        const st = streams.get(m.sid);
        if (st) st.paused = m.t === "pause";
        return;
      }
      case "close":
        sessions.delete(m.sid);
        streams
          .get(m.sid)
          ?.reader.cancel()
          .catch(() => {});
        streams.delete(m.sid);
        return;
    }
  };
}
