// startWorkerHost con un puerto falso en el main thread (en producción corre en el worker, fuera de la cobertura).
import { describe, expect, it } from "vitest";
import { loadModule } from "../../src/engine/load-browser";
import { startWorkerHost } from "../../src/worker/host";
import type { FromWorker, ToWorker } from "../../src/worker/protocol";
import { bitmapOf, configureForTests } from "./setup";

function fakePort() {
  const out: FromWorker[] = [];
  const port = {
    postMessage: (m: FromWorker) => out.push(m),
    onmessage: null as ((e: MessageEvent<ToWorker>) => void) | null,
  };
  const send = async (m: ToWorker) => {
    await port.onmessage?.({ data: m } as MessageEvent<ToWorker>);
  };
  return { port, out, send };
}

const wait = async (cond: () => boolean, ms = 5000) => {
  const t0 = performance.now();
  while (!cond()) {
    if (performance.now() - t0 > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe("worker host (puerto falso)", () => {
  it("init → ready con plugins; decode; sesión con frames; errores tipados", async () => {
    configureForTests();
    const { port, out, send } = fakePort();
    startWorkerHost({ port, plugins: { demo: () => ({ name: "demo", onFrame: async () => [] }) } });
    await send({ t: "init", wasmModule: await loadModule() });
    expect(out[0]).toEqual({ t: "ready", plugins: ["demo"] });

    await send({
      t: "decode",
      id: 1,
      input: await bitmapOf("ean13-synthetic.png"),
      options: { formats: ["ean_13"] },
    });
    await wait(() => out.some((m) => m.t === "result" && m.id === 1));
    const res = out.find((m) => m.t === "result" && m.id === 1);
    expect(res?.t === "result" && Array.isArray(res.value) && res.value[0]?.text).toBe(
      "5901234123457",
    );

    await send({ t: "decode", id: 2, input: { foo: 1 } as never, options: {} });
    await wait(() => out.some((m) => m.t === "error" && m.id === 2));
    expect(out.find((m) => m.t === "error" && m.id === 2)).toMatchObject({ code: "INVALID_INPUT" });

    const options = {
      formats: ["ean_13" as const],
      strategy: "fast" as const,
      roi: "full" as const,
      fusion: { confirmFrames: "auto" as const, windowMs: 1500, duplicateCooldownMs: 2000 },
      escalateAfterFrames: 3,
      maxCodes: 4,
      lostAfterMs: 500,
      validateChecksums: true,
      plugins: [{ name: "demo", apiVersion: 1 as const }],
    };
    await send({ t: "open", sid: 7, options });
    await send({ t: "config", sid: 7, options: { strategy: "balanced" } });
    for (let i = 0; i < 2; i++) {
      const bmp = await bitmapOf("ean13-synthetic.png");
      await send({
        t: "frame",
        sid: 7,
        id: i,
        frame: bmp,
        meta: { ts: i * 66, srcWidth: bmp.width, srcHeight: bmp.height },
      });
    }
    expect(out.filter((m) => m.t === "done" && m.sid === 7)).toHaveLength(2);
    expect(out.some((m) => m.t === "event" && m.event.type === "detect")).toBe(true);
    await send({ t: "source", sid: 7, srcWidth: 10, srcHeight: 10 });
    await send({ t: "pause", sid: 7 });
    await send({ t: "resume", sid: 7 });

    // Ruta 1: ReadableStream de VideoFrame (si el navegador tiene VideoFrame).
    if (typeof VideoFrame === "function") {
      const bmp = await bitmapOf("ean13-synthetic.png");
      const readable = new ReadableStream<VideoFrame>({
        start(c) {
          for (let i = 0; i < 3; i++) c.enqueue(new VideoFrame(bmp, { timestamp: i * 66_000 }));
          c.close();
        },
      });
      await send({ t: "open", sid: 8, options });
      await send({
        t: "stream",
        sid: 8,
        readable,
        srcWidth: bmp.width,
        srcHeight: bmp.height,
        maxFps: 60,
      });
      await wait(() => out.some((m) => m.t === "done" && m.sid === 8));
    }
    await send({ t: "close", sid: 7 });
    await send({ t: "close", sid: 8 });
  });
});
