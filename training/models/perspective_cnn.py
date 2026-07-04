import torch
import torch.nn as nn
import torch.nn.functional as F


class PerspectiveCornerDetector(nn.Module):
    """
    Detects 4 corners of a barcode in an image for perspective correction.
    Based on a MobileNetV3-Small backbone (self-implemented, BSD-style license).
    Input: 128x128x3, Output: 8 values (4 corners * [x, y]) normalized to [0,1].
    """

    def __init__(self):
        super().__init__()

        self.backbone = MobileNetV3SmallBackbone()

        self.head = nn.Sequential(
            nn.AdaptiveAvgPool2d(1),
            nn.Flatten(),
            nn.Linear(576, 256),
            nn.Hardswish(inplace=True),
            nn.Dropout(0.2),
            nn.Linear(256, 8),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor):
        features = self.backbone(x)
        corners = self.head(features)
        return corners

    def export_onnx(self, filepath: str):
        self.eval()
        dummy = torch.randn(1, 3, 128, 128)
        torch.onnx.export(
            self,
            dummy,
            filepath,
            input_names=["input"],
            output_names=["corners"],
            opset_version=13,
        )


class MobileNetV3SmallBackbone(nn.Module):
    """
    MobileNetV3-Small backbone (self-implemented).
    Takes 128x128 input.
    """

    def __init__(self):
        super().__init__()

        self.conv1 = nn.Sequential(
            nn.Conv2d(3, 16, 3, 2, 1, bias=False),
            nn.BatchNorm2d(16),
            nn.Hardswish(inplace=True),
        )

        self.bneck_configs = [
            (3, 16, 16, 16, False, "RE", 2),
            (3, 16, 72, 24, False, "RE", 2),
            (3, 24, 88, 24, False, "RE", 1),
            (5, 24, 96, 40, True, "HS", 2),
            (5, 40, 240, 40, True, "HS", 1),
            (5, 40, 240, 40, True, "HS", 1),
            (5, 40, 120, 48, True, "HS", 1),
            (5, 48, 144, 48, True, "HS", 1),
            (5, 48, 288, 96, True, "HS", 2),
            (5, 96, 576, 96, True, "HS", 1),
            (5, 96, 576, 96, True, "HS", 1),
        ]

        self.blocks = nn.ModuleList()
        for kernel, inp, exp, out, se, nl, stride in self.bneck_configs:
            self.blocks.append(
                InvertedResidual(inp, exp, out, kernel, stride, se, nl)
            )

    def forward(self, x: torch.Tensor):
        x = self.conv1(x)
        for block in self.blocks:
            x = block(x)
        return x


class InvertedResidual(nn.Module):
    def __init__(
        self,
        inp: int,
        expand: int,
        out: int,
        kernel_size: int,
        stride: int,
        use_se: bool,
        nl: str,
    ):
        super().__init__()
        self.use_residual = (stride == 1 and inp == out)
        hidden_dim = expand

        layers = []

        if expand != inp:
            layers.extend([
                nn.Conv2d(inp, hidden_dim, 1, 1, 0, bias=False),
                nn.BatchNorm2d(hidden_dim),
                self._activation(nl),
            ])

        layers.extend([
            nn.Conv2d(
                hidden_dim,
                hidden_dim,
                kernel_size,
                stride,
                kernel_size // 2,
                groups=hidden_dim,
                bias=False,
            ),
            nn.BatchNorm2d(hidden_dim),
        ])

        if use_se:
            layers.append(SqueezeExcitation(hidden_dim))

        layers.extend([
            self._activation(nl),
            nn.Conv2d(hidden_dim, out, 1, 1, 0, bias=False),
            nn.BatchNorm2d(out),
        ])

        self.block = nn.Sequential(*layers)

    def _activation(self, nl: str):
        if nl == "RE":
            return nn.ReLU(inplace=True)
        return nn.Hardswish(inplace=True)

    def forward(self, x):
        if self.use_residual:
            return self.block(x) + x
        return self.block(x)


class SqueezeExcitation(nn.Module):
    def __init__(self, channels: int, reduction: int = 4):
        super().__init__()
        self.se = nn.Sequential(
            nn.AdaptiveAvgPool2d(1),
            nn.Conv2d(channels, channels // reduction, 1),
            nn.ReLU(inplace=True),
            nn.Conv2d(channels // reduction, channels, 1),
            nn.Hardsigmoid(inplace=True),
        )

    def forward(self, x: torch.Tensor):
        return x * self.se(x)


class CornerLoss(nn.Module):
    """
    Wing Loss for corner regression - robust to outliers.
    """

    def __init__(self, omega: float = 10.0, epsilon: float = 2.0):
        super().__init__()
        self.omega = omega
        self.epsilon = epsilon

    def forward(self, pred: torch.Tensor, target: torch.Tensor):
        delta = torch.abs(pred - target)
        c = self.omega * (1.0 - torch.log(torch.tensor(1.0 + self.omega / self.epsilon)))

        loss = torch.where(
            delta < self.omega,
            self.omega * torch.log(1.0 + delta / self.epsilon),
            delta - c,
        )
        return loss.mean()
