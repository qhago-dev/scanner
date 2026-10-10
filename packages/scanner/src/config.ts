import type { EngineConfig } from "./types";

let config: EngineConfig = {};

/** Configuración global del motor (fuente única, ver tabla en F4). Se fusiona con llamadas previas. */
export function configure(next: EngineConfig): void {
  config = { ...config, ...next };
}

export function getConfig(): Readonly<EngineConfig> {
  return config;
}

/** Solo para tests. */
export function resetConfig(): void {
  config = {};
}
