"""
Benchmark trained models: measure inference time and accuracy.
Runs ONNX Runtime to evaluate exported models.
"""

import argparse
import json
import os
import time

import numpy as np
import onnxruntime as ort


def benchmark_model(model_path, input_shape, num_warmup=10, num_runs=100):
    """Benchmark a single ONNX model."""
    if not os.path.exists(model_path):
        return {"error": f"Model not found: {model_path}"}

    session = ort.InferenceSession(
        model_path,
        providers=["CPUExecutionProvider"],
    )

    input_name = session.get_inputs()[0].name
    dummy_input = np.random.randn(*input_shape).astype(np.float32)

    for _ in range(num_warmup):
        session.run(None, {input_name: dummy_input})

    times = []
    for _ in range(num_runs):
        start = time.perf_counter()
        session.run(None, {input_name: dummy_input})
        elapsed = (time.perf_counter() - start) * 1000
        times.append(elapsed)

    model_size = os.path.getsize(model_path) / (1024 * 1024)

    return {
        "model": os.path.basename(model_path),
        "size_mb": round(model_size, 2),
        "input_shape": list(input_shape),
        "mean_ms": round(np.mean(times), 2),
        "median_ms": round(np.median(times), 2),
        "min_ms": round(np.min(times), 2),
        "max_ms": round(np.max(times), 2),
        "std_ms": round(np.std(times), 2),
        "fps": round(1000 / np.mean(times), 1),
    }


def main():
    parser = argparse.ArgumentParser(description="Benchmark ONNX models")
    parser.add_argument(
        "--models-dir",
        type=str,
        default="./onnx_models",
        help="Directory containing ONNX models",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="benchmark_results.json",
        help="Output JSON file for results",
    )
    args = parser.parse_args()

    models_to_benchmark = [
        {
            "path": os.path.join(args.models_dir, "nanodet_barcode_int8.onnx"),
            "shape": (1, 3, 320, 320),
        },
        {
            "path": os.path.join(
                args.models_dir, "esrgan_tiny_int8.onnx"
            ),
            "shape": (1, 3, 64, 64),
        },
        {
            "path": os.path.join(args.models_dir, "deblur_int8.onnx"),
            "shape": (1, 3, 128, 128),
        },
        {
            "path": os.path.join(
                args.models_dir, "perspective_corners.onnx"
            ),
            "shape": (1, 3, 128, 128),
        },
        {
            "path": os.path.join(args.models_dir, "autofocus_int8.onnx"),
            "shape": (1, 3, 128, 128),
        },
    ]

    results = []

    for model_cfg in models_to_benchmark:
        print(f"Benchmarking: {model_cfg['path']}")
        result = benchmark_model(
            model_cfg["path"], model_cfg["shape"]
        )
        if "error" in result:
            print(f"  SKIP: {result['error']}")
        else:
            print(
                f"  Size: {result['size_mb']} MB | "
                f"Mean: {result['mean_ms']} ms | "
                f"FPS: {result['fps']}"
            )
        results.append(result)

    print(f"\nTotal pipeline time: ~{sum(r.get('mean_ms', 0) for r in results):.1f} ms")

    with open(args.output, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Results saved to {args.output}")


if __name__ == "__main__":
    main()
