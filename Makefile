.PHONY: all build-core build-sdk build-models build-wrappers clean test benchmark

all: build-core build-sdk

# ============================================================
# Core Rust → WASM
# ============================================================
build-core:
	@echo "Building Rust core to WASM..."
	cd core && wasm-pack build --target bundler --out-dir ../sdk/wasm --release --no-opt

build-core-web:
	@echo "Building Rust core to WASM (web target)..."
	cd core && wasm-pack build --target web --out-dir pkg/web --release --no-opt

build-core-node:
	@echo "Building Rust core to WASM (node target)..."
	cd core && wasm-pack build --target nodejs --out-dir pkg/node --release --no-opt

build-core-native:
	@echo "Building Rust core native..."
	cd core && cargo build --release

# ============================================================
# SDK JavaScript/TypeScript
# ============================================================
build-sdk:
	@echo "Building JS SDK..."
	cd sdk && npm install && npm run build

# ============================================================
# Models (Python)
# ============================================================
train-detector:
	cd training && python train/train_detector.py \
		--num-samples 100000 --batch-size 64 --epochs 100 \
		--output-dir ./checkpoints/nanodet

train-sr:
	cd training && python train/train_sr.py \
		--num-samples 50000 --batch-size 32 --epochs 50 \
		--output-dir ./checkpoints/esrgan

train-deblur:
	cd training && python train/train_deblur.py \
		--num-samples 80000 --batch-size 32 --epochs 80 \
		--output-dir ./checkpoints/deblur

train-perspective:
	cd training && python train/train_perspective.py \
		--num-samples 60000 --batch-size 64 --epochs 60 \
		--output-dir ./checkpoints/perspective

train-autofocus:
	cd training && python train/train_autofocus.py \
		--num-samples 40000 --batch-size 64 --epochs 40 \
		--output-dir ./checkpoints/autofocus

train-all: train-detector train-sr train-deblur train-perspective train-autofocus

export-onnx:
	cd training && python export/export_all_onnx.py \
		--checkpoints ./checkpoints --output-dir ../models --quantize

# ============================================================
# Wrappers
# ============================================================
build-flutter:
	cd wrappers/flutter && flutter pub get && flutter build aar

build-react-native:
	cd wrappers/react-native && npm install && npm run build

build-capacitor:
	cd wrappers/capacitor && npm install && npm run build

build-wrappers: build-flutter build-react-native build-capacitor

# ============================================================
# Testing & Benchmarking
# ============================================================
test-core:
	cd core && cargo test

gen-dataset:
	cd benchmarks/dataset && python generate.py --num-images 5000

benchmark:
	cd benchmarks/compare_quaggajs && npm install && npm run benchmark

# ============================================================
# Cleanup
# ============================================================
clean:
	@echo "Cleaning build artifacts..."
	rm -rf core/target core/pkg
	rm -rf sdk/dist sdk/node_modules sdk/wasm
	rm -rf training/checkpoints training/onnx_models
	rm -rf models/*.onnx
	rm -rf benchmarks/compare_quaggajs/node_modules

clean-models:
	rm -rf models/*.onnx
	rm -rf training/checkpoints/*

# ============================================================
# Help
# ============================================================
help:
	@echo "ScanAI SDK Build System"
	@echo ""
	@echo "Core:"
	@echo "  make build-core          Build Rust → WASM (bundler target)"
	@echo "  make build-core-web      Build Rust → WASM (web target)"
	@echo "  make build-core-native   Build Rust native (debug)"
	@echo "  make build-sdk           Build JS/TS SDK"
	@echo "  make all                 Build core + SDK"
	@echo ""
	@echo "Models:"
	@echo "  make train-detector      Train NanoDet detector"
	@echo "  make train-sr            Train ESRGAN Tiny"
	@echo "  make train-deblur        Train Deblur CNN"
	@echo "  make train-perspective   Train Perspective detector"
	@echo "  make train-autofocus     Train Autofocus classifier"
	@echo "  make train-all           Train all models"
	@echo "  make export-onnx         Export trained models to ONNX"
	@echo ""
	@echo "Testing:"
	@echo "  make test-core           Run Rust unit tests"
	@echo "  make benchmark           Run ScanAI vs QuaggaJS benchmark"
	@echo "  make gen-dataset         Generate benchmark dataset"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean               Remove all build artifacts"
	@echo "  make clean-models        Remove only model files"
