// Host del worker: decode() y sesiones de escaneo. Se exporta como "@qhago/scanner/worker-host"
// para que otros paquetes (p. ej. @qhago/ai) compongan su propio worker (F5).
import { configure } from "../config";
import { decodeInline } from "../core";
import { isScanError } from "../errors";
import { browserPlatform } from "../platform-browser";
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
  minInterval: number;
  ema: number;
  last: number;
}

export function startWorkerHost(port: Port = self as unknown as Port): void {
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
      if (!session || st.paused || st.busy || now - st.last < st.minInterval) {
        frame.close();
        continue;
      }
      st.busy = true;
      st.last = now;
      session
        .process(frame, {
          ts: now,
          srcWidth: st.srcWidth || frame.displayWidth,
          srcHeight: st.srcHeight || frame.displayHeight,
        })
        .then((r) => {
          st.ema = st.ema ? 0.8 * st.ema + 0.2 * r.ms : r.ms;
          st.minInterval = Math.max(st.minInterval, st.ema * 1.2);
          post({ t: "done", sid, id: -1, ms: r.ms, passes: r.passes });
        })
        .finally(() => {
          frame.close();
          st.busy = false;
        });
    }
  }

  port.onmessage = async (e: MessageEvent<ToWorker>) => {
    const m = e.data;
    switch (m.t) {
      case "init":
        configure({ wasmModule: m.wasmModule });
        post({ t: "ready" });
        return;
      case "decode":
        try {
          const value = await decodeInline(browserPlatform, m.input, {
            ...m.options,
            worker: false,
          });
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
          new ScannerSession(m.options, browserPlatform, (event) =>
            post({ t: "event", sid: m.sid, event }),
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
          minInterval: 1000 / Math.max(1, m.maxFps),
          ema: 0,
          last: 0,
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
