"""
Export all PyTorch models to ONNX format with quantization.
Produces files ready for ONNX Runtime Web and Mobile.
"""

import argparse
import os
import sys

import onnx
import torch
from onnxruntime.quantization import quantize_dynamic, QuantType


def export_all(args):
    os.makedirs(args.output_dir, exist_ok=True)

    device = torch.device("cpu")

    models = {
        "nanodet": {
            "path": os.path.join(args.checkpoints, "nanodet_best.pth"),
            "module": "models.nanodet",
            "class": "NanoDetBarcode",
            "init": {"num_classes": 4},
            "input_shape": (1, 3, 320, 320),
            "input_names": ["input"],
            "output_names": ["boxes", "scores", "classes"],
            "dynamic_axes": {"input": {0: "batch"}},
            "quantize": True,
        },
        "esrgan_tiny": {
            "path": os.path.join(args.checkpoints, "esrgan_tiny_final.pth"),
            "module": "models.esrgan_tiny",
            "class": "ESRGANTiny",
            "init": {"in_channels": 3, "out_channels": 3, "num_features": 32, "num_rrdb": 3, "scale": 2},
            "input_shape": (1, 3, 64, 64),
            "input_names": ["input"],
            "output_names": ["output"],
            "dynamic_axes": None,
            "quantize": True,
        },
        "deblur": {
            "path": os.path.join(args.checkpoints, "deblur_best.pth"),
            "module": "models.deblur_cnn",
            "class": "DeblurCNN",
            "init": {"in_channels": 3, "base_channels": 32},
            "input_shape": (1, 3, 128, 128),
            "input_names": ["input"],
            "output_names": ["output"],
            "dynamic_axes": None,
            "quantize": True,
        },
        "perspective": {
            "path": os.path.join(args.checkpoints, "perspective_best.pth"),
            "module": "models.perspective_cnn",
            "class": "PerspectiveCornerDetector",
            "init": {},
            "input_shape": (1, 3, 128, 128),
            "input_names": ["input"],
            "output_names": ["corners"],
            "dynamic_axes": None,
            "quantize": False,
        },
        "autofocus": {
            "path": os.path.join(args.checkpoints, "autofocus_best.pth"),
            "module": "models.autofocus_classifier",
            "class": "AutoFocusClassifier",
            "init": {},
            "input_shape": (1, 3, 128, 128),
            "input_names": ["input"],
            "output_names": ["score"],
            "dynamic_axes": None,
            "quantize": True,
        },
    }

    for name, cfg in models.items():
        print(f"\n{'='*60}")
        print(f"Exporting: {name}")
        print(f"{'='*60}")

        try:
            module = __import__(cfg["module"], fromlist=[cfg["class"]])
            ModelClass = getattr(module, cfg["class"])
            model = ModelClass(**cfg["init"]).to(device)

            if os.path.exists(cfg["path"]):
                state_dict = torch.load(cfg["path"], map_location=device)
                model.load_state_dict(state_dict)
                print(f"  Loaded weights from {cfg['path']}")
            else:
                print(f"  Warning: weights not found at {cfg['path']}, exporting untrained model")

            model.eval()

            onnx_path = os.path.join(args.output_dir, f"{name}.onnx")
            dummy = torch.randn(*cfg["input_shape"])

            export_kwargs = {
                "input_names": cfg["input_names"],
                "output_names": cfg["output_names"],
                "opset_version": 13,
            }
            if cfg["dynamic_axes"]:
                export_kwargs["dynamic_axes"] = cfg["dynamic_axes"]

            torch.onnx.export(
                model,
                dummy,
                onnx_path,
                **export_kwargs,
            )
            print(f"  Exported to {onnx_path}")

            original_size = os.path.getsize(onnx_path)

            onnx_model = onnx.load(onnx_path)
            onnx.checker.check_model(onnx_model)
            onnx.save(onnx_model, onnx_path)
            print(f"  ONNX model validated. Size: {original_size / 1024 / 1024:.2f} MB")

            if cfg["quantize"] and args.quantize:
                quant_path = os.path.join(args.output_dir, f"{name}_int8.onnx")
                print(f"  Quantizing to INT8...")
                try:
                    from onnxruntime.quantization import quantize_dynamic, QuantType
                    quantize_dynamic(
                        onnx_path,
                        quant_path,
                        weight_type=QuantType.QInt8,
                        extra_options={"ActivationSymmetric": True},
                    )
                    quant_size = os.path.getsize(quant_path)
                    print(f"  Quantized model size: {quant_size / 1024 / 1024:.2f} MB")
                    print(f"  Compression ratio: {original_size / quant_size:.2f}x")
                except Exception as e:
                    print(f"  Quantization failed: {e}. Saving FP32 model only.")
                    import shutil
                    shutil.copy(onnx_path, quant_path)

        except Exception as e:
            print(f"  Error exporting {name}: {e}")
            import traceback
            traceback.print_exc()

    print(f"\n{'='*60}")
    print(f"Export complete. Models saved to {args.output_dir}")
    print(f"{'='*60}")

    for f in sorted(os.listdir(args.output_dir)):
        fpath = os.path.join(args.output_dir, f)
        if f.endswith(".onnx"):
            size = os.path.getsize(fpath)
            print(f"  {f}: {size / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export models to ONNX")
    parser.add_argument(
        "--checkpoints",
        type=str,
        default="./checkpoints",
        help="Directory containing PyTorch checkpoints",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="./onnx_models",
        help="Output directory for ONNX models",
    )
    parser.add_argument(
        "--quantize",
        action="store_true",
        default=True,
        help="Apply INT8 dynamic quantization",
    )
    args = parser.parse_args()
    export_all(args)
