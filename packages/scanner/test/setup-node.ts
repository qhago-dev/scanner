// En tests se importa src/ directamente: el .wasm vive en wasm/ (copiado por scripts/copy-wasm.mjs).
import { configure } from "../src/config";

configure({ wasmUrl: new URL("../wasm/qhago_engine_node.wasm", import.meta.url) });
