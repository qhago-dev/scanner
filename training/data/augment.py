"""
Data augmentation utilities for barcode training images.
Applies various photometric and geometric transformations.
"""

import random

import numpy as np
from PIL import Image, ImageFilter, ImageEnhance, ImageOps


class BarcodeAugmentation:
    """
    Augmentation pipeline for barcode images.
    All transformations are self-contained.
    """

    def __init__(self, seed=None):
        self.rng = random.Random(seed)

    def apply(
        self,
        img: Image.Image,
        bboxes=None,
        corners=None,
    ):
        """
        Apply a random set of augmentations.
        Args:
            img: PIL Image
            bboxes: Optional list of [x1,y1,x2,y2] normalized [0,1]
            corners: Optional list of [x,y] normalized [0,1]
        Returns:
            Augmented image and optionally transformed annotations
        """
        if self.rng.random() < 0.5:
            img = self.adjust_brightness(img)

        if self.rng.random() < 0.3:
            img = self.adjust_contrast(img)

        if self.rng.random() < 0.3:
            img = self.adjust_saturation(img)

        if self.rng.random() < 0.2:
            img = self.add_gaussian_noise(img)

        if self.rng.random() < 0.2:
            img = self.add_salt_pepper_noise(img)

        if self.rng.random() < 0.4:
            img, bboxes = self.random_rotation(img, bboxes)

        if self.rng.random() < 0.3:
            img = self.gaussian_blur(img)

        if self.rng.random() < 0.2:
            img = self.random_crop_and_resize(img)

        return img, bboxes

    def adjust_brightness(self, img: Image.Image) -> Image.Image:
        factor = self.rng.uniform(0.3, 1.8)
        return ImageEnhance.Brightness(img).enhance(factor)

    def adjust_contrast(self, img: Image.Image) -> Image.Image:
        factor = self.rng.uniform(0.5, 2.0)
        return ImageEnhance.Contrast(img).enhance(factor)

    def adjust_saturation(self, img: Image.Image) -> Image.Image:
        factor = self.rng.uniform(0.0, 2.0)
        return ImageEnhance.Color(img).enhance(factor)

    def add_gaussian_noise(self, img: Image.Image) -> Image.Image:
        sigma = self.rng.uniform(2, 15)
        arr = np.array(img, dtype=np.float32)
        noise = np.random.normal(0, sigma, arr.shape)
        arr = arr + noise
        arr = np.clip(arr, 0, 255).astype(np.uint8)
        return Image.fromarray(arr)

    def add_salt_pepper_noise(self, img: Image.Image) -> Image.Image:
        arr = np.array(img)
        amount = self.rng.uniform(0.005, 0.03)
        salt = np.random.random(arr.shape[:2]) < amount / 2
        pepper = np.random.random(arr.shape[:2]) < amount / 2
        arr[salt] = 255
        arr[pepper] = 0
        return Image.fromarray(arr)

    def random_rotation(
        self, img: Image.Image, bboxes=None
    ) -> tuple:
        angle = self.rng.uniform(-30, 30)
        rotated = img.rotate(
            angle, expand=True, fillcolor=255, resample=Image.BILINEAR
        )
        if bboxes is not None:
            return rotated, bboxes
        return rotated, bboxes

    def gaussian_blur(self, img: Image.Image) -> Image.Image:
        radius = self.rng.uniform(0.3, 2.5)
        return img.filter(ImageFilter.GaussianBlur(radius=radius))

    def random_crop_and_resize(
        self, img: Image.Image
    ) -> Image.Image:
        w, h = img.size
        crop_w = int(w * self.rng.uniform(0.7, 0.95))
        crop_h = int(h * self.rng.uniform(0.7, 0.95))
        x = self.rng.randint(0, max(0, w - crop_w))
        y = self.rng.randint(0, max(0, h - crop_h))

        cropped = img.crop((x, y, x + crop_w, y + crop_h))
        return cropped.resize((w, h), Image.BILINEAR)


class BlurKernelGenerator:
    """
    Generate synthetic blur kernels for training deblurring models.
    Supports motion blur, defocus blur, and Gaussian blur.
    """

    @staticmethod
    def motion_blur_kernel(size: int, angle: float) -> np.ndarray:
        kernel = np.zeros((size, size))
        center = size // 2
        angle_rad = np.radians(angle)
        dx = np.cos(angle_rad)
        dy = np.sin(angle_rad)

        for i in range(size // 2):
            x = int(center + dx * i)
            y = int(center + dy * i)
            if 0 <= x < size and 0 <= y < size:
                kernel[y, x] = 1.0 / (size // 2)

        return kernel / kernel.sum()

    @staticmethod
    def defocus_kernel(radius: int) -> np.ndarray:
        size = radius * 2 + 1
        y, x = np.ogrid[-radius : radius + 1, -radius : radius + 1]
        kernel = (x**2 + y**2 <= radius**2).astype(np.float32)
        return kernel / kernel.sum()

    @staticmethod
    def gaussian_kernel(
        size: int, sigma: float
    ) -> np.ndarray:
        center = size // 2
        y, x = np.ogrid[-center : center + 1, -center : center + 1]
        kernel = np.exp(-(x**2 + y**2) / (2 * sigma**2))
        return kernel / kernel.sum()
