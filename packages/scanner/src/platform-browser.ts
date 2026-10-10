import type { Platform } from "./core";
import { loadEngine } from "./engine/load-browser";
import { toRaster } from "./input/browser";

export const browserPlatform: Platform = { loadEngine, toRaster: (input) => toRaster(input) };
