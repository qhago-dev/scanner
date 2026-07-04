"""
Generate benchmark dataset: 5,000 barcode images across 10 adversial scenarios.
Each image has a corresponding ground truth JSON file with expected barcode text.
Used to compare ScanAI SDK vs QuaggaJS performance.
"""

import argparse
import json
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageEnhance


SCENARIOS = [
    ("01_normal", "Normal Light"),
    ("02_low_light", "Low Light (<50 lux)"),
    ("03_motion_blur", "Motion Blur"),
    ("04_wrinkled", "Wrinkled Codes"),
    ("05_perspective", "Extreme Perspective (>45deg)"),
    ("06_occluded", "Partially Occluded"),
    ("07_small", "Small Codes (<50px)"),
    ("08_multiple", "Multiple Codes"),
    ("09_glare", "Screen Reflection/Glare"),
    ("10_combined", "Combined Adverse"),
]

BARCODE_TEXTS = [
    "5901234123457",
    "9780201379624",
    "4006381333931",
    "A1B2C3D4E5",
    "HELLO-WORLD",
    "SCAN-TEST-001",
    "1234567890",
    "QR-TEST-DATA-2026",
    "https://example.com/scan",
    "PRODUCT-CODE-99",
]

QR_TEXTS = [
    "https://scanai.dev/test",
    "BEGIN:VCARD\nVERSION:3.0\nFN:Test User\nEND:VCARD",
    "WIFI:S:TestNetwork;T:WPA;P:password123;;",
    "SMSTO:+1234567890:Hello from ScanAI",
    "MATMSG:TO:test@scanai.dev;SUB:Benchmark;BODY:Testing;;",
]


def generate_barcode_1d(draw, x, y, w, h, text):
    """Draw a simple 1D barcode representation."""
    module_width = max(2, w // (len(text) * 4))
    total_width = module_width * len(text) * 4
    start_x = x + (w - total_width) // 2

    for i, ch in enumerate(text):
        code = ord(ch) % 103
        for bit_pos in range(4):
            bit = (code >> bit_pos) & 1
            if bit:
                bx = start_x + i * module_width * 4 + bit_pos * module_width
                draw.rectangle([bx, y, bx + module_width - 1, y + h], fill=0)
    return text


def generate_qr_style(draw, x, y, size, data):
    """Draw a QR-style pattern."""
    module = max(2, size // 21)
    random.seed(hash(data) % (2**31))

    for row in range(21):
        for col in range(21):
            is_finder = (
                (row < 7 and col < 7)
                or (row < 7 and col > 13)
                or (row > 13 and col < 7)
            )
            is_dark = is_finder or random.random() < 0.35
            if is_dark:
                draw.rectangle(
                    [
                        x + col * module,
                        y + row * module,
                        x + (col + 1) * module - 1,
                        y + (row + 1) * module - 1,
                    ],
                    fill=0,
                )
    return data


def apply_scenario_effects(img, scenario_id, draw):
    """Apply scenario-specific distortions."""
    if scenario_id == "02_low_light":
        enhancer = ImageEnhance.Brightness(img)
        img = enhancer.enhance(0.15 + random.random() * 0.2)

    elif scenario_id == "03_motion_blur":
        angle = random.uniform(0, 360)
        length = random.randint(8, 20)
        img = img.filter(ImageFilter.GaussianBlur(radius=random.uniform(2, 5)))

    elif scenario_id == "04_wrinkled":
        img = img.rotate(random.uniform(-5, 5), expand=False, fillcolor=255)

    elif scenario_id == "05_perspective":
        w, h = img.size
        img = img.transform(
            (w, h),
            Image.PERSPECTIVE,
            [
                1 + random.uniform(-0.2, 0.2),
                random.uniform(-0.15, 0),
                random.uniform(-0.15, 0),
                random.uniform(-0.1, 0.1),
                1 + random.uniform(-0.1, 0.3),
                random.uniform(0, 0.1),
                random.uniform(-0.001, 0.001),
                random.uniform(-0.001, 0.001),
            ],
            Image.BILINEAR,
            fillcolor=255,
        )

    elif scenario_id == "06_occluded":
        w, h = img.size
        occlusion_w = int(w * random.uniform(0.15, 0.40))
        occlusion_h = int(h * random.uniform(0.15, 0.40))
        ox = random.randint(0, w - occlusion_w)
        oy = random.randint(0, h - occlusion_h)
        draw.rectangle(
            [ox, oy, ox + occlusion_w, oy + occlusion_h],
            fill=(200 + random.randint(-20, 20)),
            outline=(180),
        )

    elif scenario_id == "07_small":
        pass

    elif scenario_id == "08_multiple":
        pass

    elif scenario_id == "09_glare":
        w, h = img.size
        glare_x = random.randint(0, w // 2)
        glare_y = random.randint(0, h // 2)
        glare_r = random.randint(30, 80)
        for _ in range(5):
            draw.ellipse(
                [
                    glare_x - glare_r,
                    glare_y - glare_r,
                    glare_x + glare_r,
                    glare_y + glare_r,
                ],
                fill=(255, 255, 255, 180),
            )
            glare_x += random.randint(-20, 20)
            glare_y += random.randint(-20, 20)
            glare_r = random.randint(20, 50)

    elif scenario_id == "10_combined":
        enhancer = ImageEnhance.Brightness(img)
        img = enhancer.enhance(0.2 + random.random() * 0.2)
        img = img.filter(ImageFilter.GaussianBlur(radius=random.uniform(1.5, 4)))
        img = img.rotate(random.uniform(-20, 20), expand=False, fillcolor=255)

    return img


def generate_dataset(output_dir, num_images=5000):
    os.makedirs(output_dir, exist_ok=True)

    for scenario_dir, _ in SCENARIOS:
        os.makedirs(os.path.join(output_dir, scenario_dir), exist_ok=True)

    images_per_scenario = num_images // len(SCENARIOS)

    for scenario_dir, scenario_name in SCENARIOS:
        print(f"Generating: {scenario_name}")

        for i in range(images_per_scenario):
            w, h = 640, 480
            bg_color = (
                random.randint(200, 255),
                random.randint(200, 255),
                random.randint(200, 255),
            )
            img = Image.new("RGB", (w, h), bg_color)
            draw = ImageDraw.Draw(img)

            ground_truth = None

            if scenario_dir == "08_multiple":
                num_codes = random.randint(2, 5)
                texts = []
                for _ in range(num_codes):
                    is_1d = random.random() < 0.5
                    code_w = random.randint(60, 150)
                    code_h = random.randint(30, 80)
                    cx = random.randint(10, w - code_w - 10)
                    cy = random.randint(10, h - code_h - 10)

                    if is_1d:
                        text = random.choice(BARCODE_TEXTS)
                        generate_barcode_1d(draw, cx, cy, code_w, code_h, text)
                        texts.append(text)
                    else:
                        text = random.choice(QR_TEXTS)
                        code_size = min(code_w, code_h)
                        generate_qr_style(draw, cx, cy, code_size, text)
                        texts.append(text)
                ground_truth = texts[0]
            else:
                is_1d = random.random() < 0.5
                code_w = random.randint(80, 300) if scenario_dir != "07_small" else random.randint(20, 45)
                code_h = random.randint(40, 120) if scenario_dir != "07_small" else random.randint(20, 45)

                cx = random.randint(20, w - code_w - 20)
                cy = random.randint(20, h - code_h - 20)

                if is_1d:
                    ground_truth = random.choice(BARCODE_TEXTS)
                    generate_barcode_1d(draw, cx, cy, code_w, code_h, ground_truth)
                else:
                    ground_truth = random.choice(QR_TEXTS)
                    code_size = min(code_w, code_h)
                    generate_qr_style(draw, cx, cy, code_size, ground_truth)

                img = apply_scenario_effects(img, scenario_dir, draw)

            image_path = os.path.join(
                output_dir, scenario_dir, f"image_{i:05d}.png"
            )
            img.save(image_path)

            if ground_truth:
                truth_path = image_path.replace(".png", ".json")
                with open(truth_path, "w") as f:
                    json.dump({"text": ground_truth, "format": "1d" if is_1d else "qr"}, f)

        print(f"  Generated {images_per_scenario} images")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate benchmark dataset")
    parser.add_argument(
        "--num-images",
        type=int,
        default=5000,
        help="Total number of images to generate",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="./images",
        help="Output directory for dataset",
    )
    args = parser.parse_args()
    generate_dataset(args.output_dir, args.num_images)
