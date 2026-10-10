#!/usr/bin/env python3
"""Export y cuantización del detector (F5.4).

  PYTHONPATH=training/.pydeps python3 training/export/export_onnx.py \
      --ckpt training/runs/detector-v1/best.pt --data training/data/synth/out --out training/runs/detector-v1/onnx

Genera detector.fp32.onnx (opset 17), detector.fp16.onnx (WebGPU) y detector.int8.onnx (QDQ estático, 500 imágenes
de calibración del split de validación; 200 por defecto: Percentile guarda activaciones en RAM). Verifica ORT vs PyTorch (FP32: |Δ| ≤ 1e-4 en heat; FP16/INT8: se mide
mAP@0.5 en validación y se reporta la caída) y escribe report.json.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import onnx
import onnxruntime as ort
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from eval.metrics import evaluate  # noqa: E402
from models.centernet_lite import INPUT, NUM_CLASSES, CenterNetLite, decode  # noqa: E402
from train.train_detector import letterbox, load  # noqa: E402

FP32_TOL = 1e-4


def HEAD_OUTPUTS(graph) -> set[str]:  # noqa: N802
    """Tensores que alimentan las salidas del grafo (directamente o vía Sigmoid)."""
    outs = {o.name for o in graph.output}
    feeds = {i for n in graph.node if n.op_type == "Sigmoid" and set(n.output) & outs for i in n.input}
    return outs | feeds


def prep(root: Path, rec: dict) -> tuple[np.ndarray, list]:
    img = cv2.imread(str(root / rec["file"]), cv2.IMREAD_GRAYSCALE)
    lb, s, px, py = letterbox(img)
    gts = [(o["cls"], np.array(o["corners"], np.float32) * s + np.float32([px, py])) for o in rec["objects"]]
    return (lb.astype(np.float32) / 255.0)[None, None], gts


def ort_session(path: Path) -> ort.InferenceSession:
    so = ort.SessionOptions()
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    return ort.InferenceSession(str(path), so, providers=["CPUExecutionProvider"])


def run_eval(sess: ort.InferenceSession, samples: list, fp16: bool = False) -> dict:
    preds, gts, ms = [], [], []
    for x, g in samples:
        t0 = time.perf_counter()
        out = sess.run(None, {"input": x.astype(np.float16) if fp16 else x})
        ms.append((time.perf_counter() - t0) * 1000)
        heat, off, cor = (torch.from_numpy(o.astype(np.float32)) for o in out)
        preds.append(decode(heat, off, cor, thr=0.2)[0])
        gts.append(g)
    m = evaluate(preds, gts, NUM_CLASSES)
    m["cpu_ms_p50"] = round(float(np.median(ms)), 2)
    return m


class Calib:
    """CalibrationDataReader de ORT sobre imágenes ya preprocesadas."""

    def __init__(self, xs: list[np.ndarray]) -> None:
        self.it = iter([{"input": x} for x in xs])

    def get_next(self):
        return next(self.it, None)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", type=Path, required=True)
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--width", type=float, default=1.5)
    ap.add_argument("--head", choices=["full", "shared"], default="full")
    ap.add_argument("--calib", type=int, default=200)  # Percentile guarda activaciones: 500 agota 32 GB de RAM
    ap.add_argument("--eval", type=int, default=1000)
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)

    model = CenterNetLite(width=a.width, head=a.head)
    model.load_state_dict(torch.load(a.ckpt, map_location="cpu", weights_only=True))
    model.eval()

    fp32 = a.out / "detector.fp32.onnx"
    dummy = torch.zeros(1, 1, INPUT, INPUT)
    torch.onnx.export(
        model, (dummy,), str(fp32), opset_version=17, dynamo=False,
        input_names=["input"], output_names=["heat", "offset", "corners"],
    )
    onnx.checker.check_model(onnx.load(str(fp32)))

    # Validación = mismo 2 % inicial que usa el entrenamiento (nunca visto en train).
    recs = load(a.data / "labels.jsonl")
    n_val = max(200, len(recs) // 50)
    val = recs[:n_val]
    samples = [prep(a.data, r) for r in val[: a.eval]]

    # 1) FP32: paridad numérica con PyTorch.
    sess = ort_session(fp32)
    worst = 0.0
    with torch.no_grad():
        for x, _ in samples[:50]:
            ref = model(torch.from_numpy(x))
            got = sess.run(None, {"input": x})
            worst = max(worst, max(float(np.abs(r.numpy() - g).max()) for r, g in zip(ref, got)))
    report: dict = {"fp32_max_abs_diff": worst, "fp32_tolerance": FP32_TOL, "fp32_parity_ok": worst <= FP32_TOL}
    report["fp32"] = run_eval(sess, samples)

    # 2) FP16 (WebGPU): pesos y activaciones en half; entrada/salida también.
    from onnxconverter_common import float16

    fp16 = a.out / "detector.fp16.onnx"
    onnx.save(float16.convert_float_to_float16(onnx.load(str(fp32)), keep_io_types=False), str(fp16))
    report["fp16"] = run_eval(ort_session(fp16), samples, fp16=True)

    # 3) INT8 estático QDQ (WASM): calibración con imágenes de validación distintas de las de evaluación.
    from onnxruntime.quantization import CalibrationMethod, QuantFormat, QuantType, quantize_static
    from onnxruntime.quantization.shape_inference import quant_pre_process

    pre = a.out / "detector.pre.onnx"
    quant_pre_process(str(fp32), str(pre))
    calib_recs = val[a.eval : a.eval + a.calib] if len(val) >= a.eval + a.calib else val[: a.calib]
    int8 = a.out / "detector.int8.onnx"
    # Las convs finales de las cabezas (y el Sigmoid) quedan en FP32: cuantizarlas hunde el mAP (0,94 → 0,59
    # en la prueba con la época 5) por el rango de las regresiones de esquinas y los logits del heatmap.
    graph = onnx.load(str(pre)).graph
    keep_fp32 = [n.name for n in graph.node if n.op_type == "Sigmoid" or (n.op_type == "Conv" and set(n.output) & HEAD_OUTPUTS(graph))]
    quantize_static(
        str(pre), str(int8), Calib([prep(a.data, r)[0] for r in calib_recs]),
        quant_format=QuantFormat.QDQ, per_channel=True, activation_type=QuantType.QUInt8,
        weight_type=QuantType.QInt8, calibrate_method=CalibrationMethod.Percentile,
        extra_options={"CalibPercentile": 99.99}, nodes_to_exclude=keep_fp32,
    )
    report["int8_fp32_nodes"] = keep_fp32
    pre.unlink()
    report["int8"] = run_eval(ort_session(int8), samples)
    report["calibration_images"] = len(calib_recs)
    report["eval_images"] = len(samples)
    for k in ("fp32", "fp16", "int8"):
        report[k]["bytes"] = (a.out / f"detector.{k}.onnx").stat().st_size
    report["map_drop_fp16"] = round(report["fp32"]["mAP50"] - report["fp16"]["mAP50"], 4)
    report["map_drop_int8"] = round(report["fp32"]["mAP50"] - report["int8"]["mAP50"], 4)
    (a.out / "report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    if not report["fp32_parity_ok"]:
        sys.exit("paridad FP32 fuera de tolerancia")


if __name__ == "__main__":
    main()
