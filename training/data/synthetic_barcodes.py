"""
Synthetic barcode dataset generator for all model types.
Generates barcodes with various distortions for training:
- Detection: images with bounding boxes
- Super-resolution: low-res/high-res pairs
- Deblurring: blurred/sharp pairs
- Perspective: images with corner annotations
- Autofocus: focused/blurred pairs

Uses python-barcode (MIT), qrcode (BSD), Pillow (BSD).
All generated data is original - no copyrighted or licensed barcode images.
"""

import io
import math
import os
import random
import struct
from typing import Optional, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


class SyntheticBarcodeGenerator:
    """
    Generates synthetic barcode images for training.
    Uses PIL to render barcodes programmatically.
    No external barcode rendering libraries required for 1D barcodes.
    """

    BARCODE_1D_TYPES = ["code128", "code39", "ean13", "upca"]
    BARCODE_2D_TYPES = ["qr", "datamatrix"]

    def __init__(self, seed: Optional[int] = None):
        if seed is not None:
            random.seed(seed)
            np.random.seed(seed)

    def generate_barcode_1d(
        self,
        barcode_type: str = "code128",
        text: Optional[str] = None,
        module_width: int = 2,
        height: int = 100,
    ) -> Image.Image:
        """
        Generate a synthetic 1D barcode image.
        Renders bars programmatically without external libs.
        """
        if text is None:
            text = self._random_barcode_text(barcode_type)

        encoded, text = self._encode_barcode(barcode_type, text)

        width = len(encoded) * module_width
        img = Image.new("L", (width, height), 255)
        draw = ImageDraw.Draw(img)

        for i, bit in enumerate(encoded):
            if bit == "1":
                x = i * module_width
                draw.rectangle([x, 0, x + module_width - 1, height], fill=0)

        return img, text

    def _random_barcode_text(self, barcode_type: str) -> str:
        if barcode_type == "ean13":
            return "".join(str(random.randint(0, 9)) for _ in range(13))
        elif barcode_type == "upca":
            return "".join(str(random.randint(0, 9)) for _ in range(12))
        elif barcode_type == "code39":
            chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%"
            return "*" + "".join(random.choice(chars) for _ in range(random.randint(4, 12))) + "*"
        else:
            chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
            return "".join(random.choice(chars) for _ in range(random.randint(6, 20)))

    def _encode_barcode(self, barcode_type: str, text: str) -> Tuple[str, str]:
        """
        Simple barcode encoder that generates binary patterns.
        For production, integrate with python-barcode (MIT).
        """
        if barcode_type == "code128":
            return self._encode_code128(text)
        elif barcode_type == "code39":
            return self._encode_code39(text)
        elif barcode_type == "ean13":
            return self._encode_ean13(text)
        elif barcode_type == "upca":
            return self._encode_upca(text)
        else:
            return self._encode_code128(text)

    def _encode_code128(self, text: str) -> Tuple[str, str]:
        bars = []
        bars.append("11010010000")
        for ch in text:
            code = ord(ch) % 103
            bars.append(self._code128_pattern(code))
        checksum = 104
        for i, ch in enumerate(text):
            checksum += (ord(ch) % 103) * (i + 1)
        checksum = checksum % 103
        bars.append(self._code128_pattern(checksum))
        bars.append("1100011101011")
        return "".join(bars), text

    def _code128_pattern(self, n: int) -> str:
        patterns = [
            "11011001100", "11001101100", "11001100110", "10010011000",
            "10010001100", "10001001100", "10011001000", "10011000100",
            "10001100100", "11001001000", "11001000100", "11000100100",
        ]
        return patterns[n % len(patterns)] if n < len(patterns) else patterns[0]

    def _encode_code39(self, text: str) -> Tuple[str, str]:
        patterns = {
            "0": "101001101101", "1": "110100101011", "2": "101100101011",
            "3": "110110010101", "4": "101001101011", "5": "110100110101",
            "6": "101100110101", "7": "101001011011", "8": "110100101101",
            "9": "101100101101", "A": "110101001011", "B": "101101001011",
            "C": "110110100101", "D": "101011001011", "E": "110101100101",
            "F": "101101100101", "G": "101010011011", "H": "110101001101",
            "I": "101101001101", "J": "101011001101", "K": "110101010011",
            "L": "101101010011", "M": "110110101001", "N": "101011010011",
            "O": "110101101001", "P": "101101101001", "Q": "101010110011",
            "R": "110101011001", "S": "101101011001", "T": "101011011001",
            "U": "110010101011", "V": "100110101011", "W": "110011010101",
            "X": "100101101011", "Y": "110010110101", "Z": "100110110101",
            "-": "100101011011", ".": "110010101101", " ": "100110101101",
            "$": "100100100101", "/": "100100101001", "+": "100101001001",
            "%": "101001001001", "*": "100101101101",
        }
        result = []
        for ch in text.upper():
            if ch in patterns:
                result.append(patterns[ch])
        return "".join(result), text

    def _encode_ean13(self, text: str) -> Tuple[str, str]:
        result = ["101"]
        l_patterns = [
            "0001101", "0011001", "0010011", "0111101", "0100011",
            "0110001", "0101111", "0111011", "0110111", "0001011",
        ]
        r_patterns = [
            "1110010", "1100110", "1101100", "1000010", "1011100",
            "1001110", "1010000", "1000100", "1001000", "1110100",
        ]
        for i, ch in enumerate(text[1:7]):
            result.append(l_patterns[int(ch)])
        result.append("01010")
        for ch in text[7:]:
            result.append(r_patterns[int(ch)])
        result.append("101")
        return "".join(result), text

    def _encode_upca(self, text: str) -> Tuple[str, str]:
        return self._encode_ean13("0" + text), text

    def generate_barcode_2d(
        self, barcode_type: str = "qr", data: Optional[str] = None
    ) -> Image.Image:
        """
        Generate a synthetic QR code or Data Matrix.
        Falls back to simple pattern if QR library not available.
        """
        if data is None:
            data = f"https://example.com/{random.randint(1000, 9999)}"

        try:
            import qrcode
            qr = qrcode.QRCode(
                version=random.randint(1, 6),
                error_correction=qrcode.constants.ERROR_CORRECT_M,
                box_size=8,
                border=2,
            )
            qr.add_data(data)
            qr.make(fit=True)
            img = qr.make_image(fill_color="black", back_color="white")
            return img, data
        except ImportError:
            size = 128
            img = Image.new("L", (size, size), 255)
            draw = ImageDraw.Draw(img)
            module = 4
            np.random.seed(hash(data) % (2**31))
            for y in range(0, size, module):
                for x in range(0, size, module):
                    if (x // module + y // module) % 2 == random.randint(0, 1):
                        draw.rectangle(
                            [x, y, x + module - 1, y + module - 1], fill=0
                        )
            return img, data


class BarcodeDetectionDataset:
    """
    Dataset for training the barcode detector.
    Generates images with barcodes and bounding box annotations.
    """

    CLASS_NAMES = ["barcode_1d", "qr_code", "datamatrix", "pdf417"]

    def __init__(
        self,
        num_samples: int = 10000,
        image_size: Tuple[int, int] = (320, 320),
        num_classes: int = 4,
        augment: bool = True,
        seed: Optional[int] = None,
    ):
        self.num_samples = num_samples
        self.image_size = image_size
        self.num_classes = num_classes
        self.augment = augment
        self.generator = SyntheticBarcodeGenerator(seed)

    def __len__(self):
        return self.num_samples

    def __getitem__(self, idx):
        import torch

        w, h = self.image_size
        bg = Image.new("RGB", (w, h), self._random_bg_color())
        draw = ImageDraw.Draw(bg)

        num_codes = random.randint(1, 4)
        boxes = []
        classes = []

        for _ in range(num_codes):
            code_type = random.randint(0, self.num_classes - 1)

            if code_type == 0:
                barcode_img, _ = self.generator.generate_barcode_1d(
                    barcode_type=random.choice(["code128", "code39", "ean13"]),
                    height=random.randint(40, 120),
                )
            else:
                barcode_img, _ = self.generator.generate_barcode_2d(
                    barcode_type="qr"
                )

            scale = random.uniform(0.3, 1.5)
            new_w = int(barcode_img.width * scale)
            new_h = int(barcode_img.height * scale)

            if new_w < 20:
                new_w = 20
            if new_h < 20:
                new_h = 20

            if new_w > w - 20:
                new_w = w - 20
            if new_h > h - 20:
                new_h = h - 20

            barcode_img = barcode_img.resize((new_w, new_h), Image.LANCZOS)

            if barcode_img.width > 0 and barcode_img.height > 0:
                max_x = max(0, w - barcode_img.width)
                max_y = max(0, h - barcode_img.height)
                px = random.randint(0, max_x)
                py = random.randint(0, max_y)

                rotated = barcode_img.rotate(
                    random.uniform(-30, 30),
                    expand=True,
                    fillcolor=255,
                )

                bg.paste(
                    rotated.convert("RGB"),
                    (px, py),
                    rotated if rotated.mode == "L" else None,
                )

                boxes.append(
                    [
                        px / w,
                        py / h,
                        (px + new_w) / w,
                        (py + new_h) / h,
                    ]
                )
                classes.append(code_type)

        if self.augment:
            bg = self._apply_augmentations(bg)

        img_array = np.array(bg, dtype=np.float32) / 255.0
        img_tensor = torch.from_numpy(img_array).permute(2, 0, 1)

        return img_tensor, {
            "boxes": torch.tensor(boxes, dtype=torch.float32),
            "scores": torch.tensor(
                [0.8 + random.random() * 0.2 for _ in boxes],
                dtype=torch.float32,
            ),
            "classes": torch.tensor(classes, dtype=torch.long),
        }

    def _random_bg_color(self) -> Tuple[int, int, int]:
        base = random.randint(180, 255)
        noise = random.randint(-20, 20)
        return (
            max(0, min(255, base + noise)),
            max(0, min(255, base + noise - 10)),
            max(0, min(255, base + noise + 5)),
        )

    def _apply_augmentations(self, img: Image.Image) -> Image.Image:
        if random.random() < 0.5:
            img = ImageOps.autocontrast(img)

        if random.random() < 0.3:
            img = img.filter(
                ImageFilter.GaussianBlur(radius=random.uniform(0, 1.5))
            )

        if random.random() < 0.3:
            noise = np.random.normal(0, random.uniform(2, 10), (*img.size[::-1], 3))
            img_array = np.array(img, dtype=np.float32) + noise
            img_array = np.clip(img_array, 0, 255).astype(np.uint8)
            img = Image.fromarray(img_array)

        if random.random() < 0.4:
            brightness = random.uniform(0.5, 1.5)
            img = Image.fromarray(
                np.clip(
                    np.array(img, dtype=np.float32) * brightness, 0, 255
                ).astype(np.uint8)
            )

        return img


class SuperResolutionDataset:
    """
    Dataset for training the super-resolution model.
    Generates low-res/high-res pairs of barcode images.
    """

    def __init__(
        self,
        num_samples: int = 10000,
        hr_size: int = 128,
        scale: int = 2,
        augment: bool = True,
        seed: Optional[int] = None,
    ):
        self.num_samples = num_samples
        self.hr_size = hr_size
        self.scale = scale
        self.augment = augment
        self.generator = SyntheticBarcodeGenerator(seed)

    def __len__(self):
        return self.num_samples

    def __getitem__(self, idx):
        import torch

        hr = Image.new("RGB", (self.hr_size, self.hr_size), (255, 255, 255))

        if random.random() < 0.5:
            barcode_img, _ = self.generator.generate_barcode_1d(
                height=random.randint(60, self.hr_size - 10)
            )
        else:
            barcode_img, _ = self.generator.generate_barcode_2d()

        scale_img = random.uniform(0.4, 0.95)
        new_w = int(barcode_img.width * scale_img)
        new_h = int(barcode_img.height * scale_img)

        if new_w > 0 and new_h > 0 and new_w < self.hr_size and new_h < self.hr_size:
            barcode_img = barcode_img.resize((new_w, new_h), Image.LANCZOS)
            px = (self.hr_size - new_w) // 2
            py = (self.hr_size - new_h) // 2

            barcode_rgb = barcode_img.convert("RGB")
            hr.paste(barcode_rgb, (px, py))

        lr_size = self.hr_size // self.scale
        lr = hr.resize((lr_size, lr_size), Image.BILINEAR)

        if self.augment and random.random() < 0.3:
            lr = lr.filter(ImageFilter.GaussianBlur(radius=0.5))

        hr_array = np.array(hr, dtype=np.float32) / 255.0
        lr_array = np.array(lr, dtype=np.float32) / 255.0

        hr_tensor = torch.from_numpy(hr_array).permute(2, 0, 1)
        lr_tensor = torch.from_numpy(lr_array).permute(2, 0, 1)

        return lr_tensor, hr_tensor


class DeblurDataset:
    """
    Dataset for training the deblurring model.
    Generates sharp/blurred pairs with synthetic motion blur kernels.
    """

    def __init__(
        self,
        num_samples: int = 10000,
        image_size: Tuple[int, int] = (128, 128),
        augment: bool = True,
        seed: Optional[int] = None,
    ):
        self.num_samples = num_samples
        self.image_size = image_size
        self.augment = augment
        self.generator = SyntheticBarcodeGenerator(seed)

    def __len__(self):
        return self.num_samples

    def __getitem__(self, idx):
        import torch

        w, h = self.image_size
        sharp = Image.new("RGB", (w, h), (255, 255, 255))

        if random.random() < 0.5:
            barcode_img, _ = self.generator.generate_barcode_1d(
                height=random.randint(40, h - 10)
            )
        else:
            barcode_img, _ = self.generator.generate_barcode_2d()

        scale = random.uniform(0.3, 0.9)
        new_w = int(barcode_img.width * scale)
        new_h = int(barcode_img.height * scale)

        if new_w > 0 and new_h > 0 and new_w < w and new_h < h:
            barcode_img = barcode_img.resize((new_w, new_h), Image.LANCZOS)
            px = (w - new_w) // 2
            py = (h - new_h) // 2
            sharp.paste(barcode_img.convert("RGB"), (px, py))

        blurred = self._apply_blur(sharp)

        if self.augment and random.random() < 0.3:
            noise = np.random.normal(0, random.uniform(1, 5), (*blurred.size[::-1], 3))
            img_array = np.array(blurred, dtype=np.float32) + noise
            img_array = np.clip(img_array, 0, 255).astype(np.uint8)
            blurred = Image.fromarray(img_array)

        sharp_array = np.array(sharp, dtype=np.float32) / 255.0
        blur_array = np.array(blurred, dtype=np.float32) / 255.0

        blur_tensor = torch.from_numpy(blur_array).permute(2, 0, 1)
        sharp_tensor = torch.from_numpy(sharp_array).permute(2, 0, 1)

        return blur_tensor, sharp_tensor

    def _apply_blur(self, img: Image.Image) -> Image.Image:
        blur_type = random.choice(["motion", "gaussian", "defocus"])

        if blur_type == "motion":
            angle = random.uniform(0, 360)
            length = random.randint(5, 25)
            return self._motion_blur(img, angle, length)
        elif blur_type == "gaussian":
            radius = random.uniform(1.5, 5.0)
            return img.filter(ImageFilter.GaussianBlur(radius=radius))
        else:
            return self._defocus_blur(img)

    def _motion_blur(
        self, img: Image.Image, angle: float, length: int
    ) -> Image.Image:
        arr = np.array(img, dtype=np.float32)
        rad = math.radians(angle)
        dx = math.cos(rad)
        dy = math.sin(rad)

        kernel_size = length * 2 + 1
        kernel = np.zeros((kernel_size, kernel_size))
        center = length

        for i in range(length):
            x = int(center + dx * i)
            y = int(center + dy * i)
            if 0 <= x < kernel_size and 0 <= y < kernel_size:
                kernel[y, x] = 1.0 / length

        kernel = kernel / kernel.sum()

        result = np.zeros_like(arr)
        for c in range(arr.shape[2]):
            result[:, :, c] = np.convolve(
                arr[:, :, c].flatten(), kernel.flatten(), mode="same"
            ).reshape(arr.shape[:2])

        result = np.clip(result, 0, 255).astype(np.uint8)
        return Image.fromarray(result)

    def _defocus_blur(self, img: Image.Image) -> Image.Image:
        arr = np.array(img, dtype=np.float32)
        radius = random.randint(3, 10)
        kernel_size = radius * 2 + 1
        y, x = np.ogrid[-radius : radius + 1, -radius : radius + 1]
        mask = x**2 + y**2 <= radius**2
        kernel = np.zeros((kernel_size, kernel_size))
        kernel[mask] = 1.0
        kernel /= kernel.sum()

        result = np.zeros_like(arr)
        for c in range(arr.shape[2]):
            result[:, :, c] = np.convolve(
                arr[:, :, c].flatten(), kernel.flatten(), mode="same"
            ).reshape(arr.shape[:2])

        result = np.clip(result, 0, 255).astype(np.uint8)
        return Image.fromarray(result)


class PerspectiveDataset:
    """
    Dataset for training the perspective corner detector.
    Generates barcode images with simulated perspective and corner annotations.
    """

    def __init__(
        self,
        num_samples: int = 10000,
        image_size: Tuple[int, int] = (128, 128),
        augment: bool = True,
        seed: Optional[int] = None,
    ):
        self.num_samples = num_samples
        self.image_size = image_size
        self.augment = augment
        self.generator = SyntheticBarcodeGenerator(seed)

    def __len__(self):
        return self.num_samples

    def __getitem__(self, idx):
        import torch

        w, h = self.image_size

        src_w = random.randint(w // 2, w)
        src_h = random.randint(h // 2, h)

        barcode = Image.new("RGB", (src_w, src_h), (255, 255, 255))

        if random.random() < 0.5:
            barcode_img, _ = self.generator.generate_barcode_1d(
                height=random.randint(20, src_h // 2)
            )
        else:
            barcode_img, _ = self.generator.generate_barcode_2d()

        bw = barcode_img.width
        bh = barcode_img.height
        if bw > src_w:
            bw = src_w - 4
            barcode_img = barcode_img.resize((bw, bh), Image.LANCZOS)
        if bh > src_h:
            bh = src_h - 4
            barcode_img = barcode_img.resize((bw, bh), Image.LANCZOS)

        px = (src_w - bw) // 2
        py = (src_h - bh) // 2
        barcode.paste(barcode_img.convert("RGB"), (px, py))

        jitter = 0.15
        src_corners = np.array(
            [
                [random.uniform(-jitter, jitter), random.uniform(-jitter, jitter)],
                [1.0 + random.uniform(-jitter, jitter), random.uniform(-jitter, jitter)],
                [1.0 + random.uniform(-jitter, jitter), 1.0 + random.uniform(-jitter, jitter)],
                [random.uniform(-jitter, jitter), 1.0 + random.uniform(-jitter, jitter)],
            ]
        )

        dst_corners = np.array(
            [[0, 0], [1, 0], [1, 1], [0, 1]],
            dtype=np.float32,
        )

        src_corners = src_corners.astype(np.float32)

        matrix = self._perspective_transform(src_corners, dst_corners)

        warped = barcode.transform(
            (w, h),
            Image.PERSPECTIVE,
            matrix.reshape(-1)[:8].tolist(),
            resample=Image.BILINEAR,
            fillcolor=(255, 255, 255),
        )

        if self.augment and random.random() < 0.3:
            warped = warped.filter(
                ImageFilter.GaussianBlur(radius=random.uniform(0, 1.0))
            )

        img_array = np.array(warped, dtype=np.float32) / 255.0
        img_tensor = torch.from_numpy(img_array).permute(2, 0, 1)

        corners = src_corners.reshape(-1)
        corners_tensor = torch.from_numpy(corners).float()

        return img_tensor, corners_tensor

    def _perspective_transform(
        self, src: np.ndarray, dst: np.ndarray
    ) -> np.ndarray:
        A = []
        for i in range(4):
            x, y = src[i]
            u, v = dst[i]
            A.append([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
            A.append([0, 0, 0, x, y, 1, -v * x, -v * y, -v])
        A = np.array(A, dtype=np.float64)

        _, _, Vt = np.linalg.svd(A)

        h = Vt[-1].reshape(3, 3)
        h = h / h[2, 2]

        transform = np.array(
            [
                [h[0, 0], h[0, 1], h[0, 2]],
                [h[1, 0], h[1, 1], h[1, 2]],
                [0, 0, 1],
            ]
        )
        return transform


class AutoFocusDataset:
    """
    Dataset for training the autofocus classifier.
    Generates pairs of focused and blurred barcode images.
    """

    def __init__(
        self,
        num_samples: int = 10000,
        image_size: Tuple[int, int] = (128, 128),
        seed: Optional[int] = None,
    ):
        self.num_samples = num_samples
        self.image_size = image_size
        self.generator = SyntheticBarcodeGenerator(seed)

    def __len__(self):
        return self.num_samples

    def __getitem__(self, idx):
        import torch

        w, h = self.image_size
        img = Image.new("RGB", (w, h), (255, 255, 255))

        if random.random() < 0.5:
            barcode_img, _ = self.generator.generate_barcode_1d(
                height=random.randint(30, h - 20)
            )
        else:
            barcode_img, _ = self.generator.generate_barcode_2d()

        scale = random.uniform(0.3, 0.95)
        new_w = int(barcode_img.width * scale)
        new_h = int(barcode_img.height * scale)

        if new_w > 0 and new_h > 0 and new_w < w and new_h < h:
            barcode_img = barcode_img.resize((new_w, new_h), Image.LANCZOS)
            px = (w - new_w) // 2
            py = (h - new_h) // 2
            img.paste(barcode_img.convert("RGB"), (px, py))

        is_focused = random.random() < 0.5

        if not is_focused:
            blur_radius = random.uniform(1.5, 6.0)
            img = img.filter(ImageFilter.GaussianBlur(radius=blur_radius))

            if random.random() < 0.5:
                angle = random.uniform(0, 360)
                length = random.randint(3, 20)
                arr = np.array(img, dtype=np.float32)
                rad = math.radians(angle)
                kernel_size = length * 2 + 1
                kernel = np.zeros((kernel_size, kernel_size))
                center = length
                for i in range(length):
                    x = int(center + math.cos(rad) * i)
                    y = int(center + math.sin(rad) * i)
                    if 0 <= x < kernel_size and 0 <= y < kernel_size:
                        kernel[y, x] = 1.0 / length
                kernel /= kernel.sum()

                result = np.zeros_like(arr)
                for c in range(arr.shape[2]):
                    result[:, :, c] = np.convolve(
                        arr[:, :, c].flatten(), kernel.flatten(), mode="same"
                    ).reshape(arr.shape[:2])
                img = Image.fromarray(
                    np.clip(result, 0, 255).astype(np.uint8)
                )

        img_array = np.array(img, dtype=np.float32) / 255.0
        img_tensor = torch.from_numpy(img_array).permute(2, 0, 1)

        label = torch.tensor(1.0 if is_focused else 0.0, dtype=torch.float32)

        return img_tensor, label
