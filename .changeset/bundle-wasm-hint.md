---
"@qhago/scanner": patch
---

Node/Bun: si el `.wasm` no está junto al JS (app empaquetada con `bun build`, esbuild, ncc…), `ENGINE_LOAD_FAILED`
explica cómo resolverlo: copiar `wasm/qhago_engine_node.wasm` junto al bundle o usar `configure({ wasmUrl })`.
