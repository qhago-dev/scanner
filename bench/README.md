# bench/ — benchmark reproducible (F1)

Compara `@qhago/scanner` con Quagga2, `zxing-wasm` y `@zxing/library` sobre las **mismas muestras**
y los **mismos píxeles** (RGBA ya decodificado; Quagga2 en Node solo acepta rutas y decodifica él mismo).

```bash
bun run --filter @qhago/scanner build              # el bench usa el paquete construido
bun run bench/dataset/zxing.ts                     # set de regresión (samples de zxing-cpp)
PYTHONPATH=bench/.pydeps python3 bench/dataset/synthetic/generate.py --out bench/dataset/synthetic/out
bun run bench/dataset/fetch.ts                     # dataset real (bucket privado, si hay credenciales)

cd bench
bun run cli.ts --dataset synthetic --split dev
bun run cli.ts --dataset real --split test --reason "Gate G2"   # test exige motivo y queda registrado
bun run cli.ts --dataset public --split holdout --reason "RC" --holdout-ok   # holdout: solo release
```

Splits (F10.1): `dev` para ajustar y aprobar mejoras; `test` para gates y cierres de fase; `holdout` solo para la
release. `bench/guard.ts` aplica la regla en `cli.ts`, `runners/video.ts`, `runners/device-cam.ts` y `device-eval.ts`
y registra cada ejecución en `results/test-runs.md` / `results/holdout-runs.md`. En `public`, test y holdout son
**semi-ciegos** (salen del test anterior a F10, ya observado): control de regresión, no estimación limpia.

| Dataset | Qué es | ¿Sirve para gates? |
|---|---|---|
| `real` | Capturas propias (`apps/demo/collect.html`) | **Sí** (G2, G3, G5) |
| `synthetic` | Símbolos reales renderizados + 13 escenarios simulados | No (complemento) |
| `zxing` | `zxing-cpp/test/samples` | No (regresión) |

- Métricas (`metrics.ts`): recall por muestra y por código, lecturas falsas (texto incorrecto, extra en
  muestras `complete`, cualquiera en negativas), FP en negativas, p50/p95/p99.
- Comparaciones **pareadas** con IC 95 % por bootstrap remuestreando objetos físicos; veredictos
  "mejor" (lo > 0) / "no peor" (lo ≥ −2 pp) según el README del roadmap; gate por escenario solo con n ≥ 60.
- Salida: `results/<fecha>-<commit>-<dataset>-<split>.{md,json}`; ejecuciones sobre `test` en `results/test-runs.md`.
- En dispositivo real: `apps/demo/bench.html` (incluye `BarcodeDetector` nativo cuando existe).
- Hardware de referencia: `HARDWARE.md`. Fuentes y licencias: `dataset/SOURCES.md`.
