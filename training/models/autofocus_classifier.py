import torch
import torch.nn as nn


class AutoFocusClassifier(nn.Module):
    """
    Binary classifier: focused vs blurred barcode image.
    MobileNetV3-Small backbone (self-implemented).
    Input: 128x128x3, Output: scalar probability [0,1].
    """

    def __init__(self):
        super().__init__()

        self.backbone = MobileNetV3Small()

        self.classifier = nn.Sequential(
            nn.AdaptiveAvgPool2d(1),
            nn.Flatten(),
            nn.Linear(576, 128),
            nn.Hardswish(inplace=True),
            nn.Dropout(0.3),
            nn.Linear(128, 1),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor):
        features = self.backbone(x)
        return self.classifier(features)

    def export_onnx(self, filepath: str):
        self.eval()
        dummy = torch.randn(1, 3, 128, 128)
        torch.onnx.export(
            self,
            dummy,
            filepath,
            input_names=["input"],
            output_names=["score"],
            opset_version=13,
        )


class MobileNetV3Small(nn.Module):
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
        self.use_residual = stride == 1 and inp == out
        hidden_dim = expand

        layers = []

        if expand != inp:
            layers.extend([
                nn.Conv2d(inp, hidden_dim, 1, 1, 0, bias=False),
                nn.BatchNorm2d(hidden_dim),
                nn.Hardswish(inplace=True) if nl == "HS" else nn.ReLU(inplace=True),
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
            layers.append(
                nn.Sequential(
                    nn.AdaptiveAvgPool2d(1),
                    nn.Conv2d(hidden_dim, hidden_dim // 4, 1),
                    nn.ReLU(inplace=True),
                    nn.Conv2d(hidden_dim // 4, hidden_dim, 1),
                    nn.Hardsigmoid(inplace=True),
                )
            )

        layers.extend([
            nn.Hardswish(inplace=True) if nl == "HS" else nn.ReLU(inplace=True),
            nn.Conv2d(hidden_dim, out, 1, 1, 0, bias=False),
            nn.BatchNorm2d(out),
        ])

        self.block = nn.Sequential(*layers)

    def forward(self, x):
        if self.use_residual:
            return self.block(x) + x
        return self.block(x)
