import { readFileSync } from "node:fs";
import { type DecodeStrategy, decode, FORMATS, init } from "@qhago/scanner";
import type { Detected, Engine, FrameInput } from "./types";

const pkg = JSON.parse(
  readFileSync(new URL("../../packages/scanner/package.json", import.meta.url), "utf8"),
) as { version: string };

export function qhagoEngine(strategy: DecodeStrategy = "balanced"): Engine {
  return {
    name: strategy === "balanced" ? "qhago" : `qhago-${strategy}`,
    version: pkg.version,
    supports: FORMATS,
    notes: `strategy ${strategy}, los 13 formatos, validateChecksums por defecto`,
    async init() {
      await init();
    },
    async decode({ rgba }: FrameInput): Promise<Detected[]> {
      const r = await decode({ ...rgba, format: "rgba" }, { formats: FORMATS, strategy });
      return r.map((x) => ({ format: x.format, text: x.text }));
    },
    async dispose() {},
  };
}
