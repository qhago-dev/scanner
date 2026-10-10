import torch
import torch.nn as nn


class ESRGANTiny(nn.Module):
    """
    Tiny ESRGAN for barcode super-resolution.
    64x64 input → 128x128 output (2x upscale).
    <1 MB when quantized to INT8.
    Self-contained implementation under MIT license.
    """

    def __init__(
        self,
        in_channels: int = 3,
        out_channels: int = 3,
        num_features: int = 32,
        num_rrdb: int = 3,
        scale: int = 2,
    ):
        super().__init__()
        self.scale = scale

        self.conv_first = nn.Conv2d(in_channels, num_features, 3, 1, 1)

        rrdb_blocks = []
        for _ in range(num_rrdb):
            rrdb_blocks.append(
                ResidualInResidualDenseBlock(num_features, 0.2)
            )
        self.rrdb_blocks = nn.Sequential(*rrdb_blocks)

        self.conv_mid = nn.Conv2d(num_features, num_features, 3, 1, 1)

        self.upsample = nn.Sequential(
            nn.Conv2d(num_features, num_features * (scale**2), 3, 1, 1),
            nn.PixelShuffle(scale),
            nn.PReLU(),
            nn.Conv2d(num_features, num_features, 3, 1, 1),
            nn.PReLU(),
            nn.Conv2d(num_features, out_channels, 3, 1, 1),
        )

    def forward(self, x: torch.Tensor):
        feat = self.conv_first(x)
        out = self.rrdb_blocks(feat)
        out = self.conv_mid(out) + feat
        out = self.upsample(out)
        return out

    def export_onnx(self, filepath: str):
        self.eval()
        dummy = torch.randn(1, 3, 64, 64)
        torch.onnx.export(
            self,
            dummy,
            filepath,
            input_names=["input"],
            output_names=["output"],
            opset_version=13,
        )


class ResidualInResidualDenseBlock(nn.Module):
    def __init__(self, nf: int, res_scale: float = 0.2):
        super().__init__()
        self.res_scale = res_scale

        self.rdb1 = DenseBlock(nf)
        self.rdb2 = DenseBlock(nf)
        self.rdb3 = DenseBlock(nf)

    def forward(self, x: torch.Tensor):
        out = self.rdb1(x)
        out = self.rdb2(out)
        out = self.rdb3(out)
        return out * self.res_scale + x


class DenseBlock(nn.Module):
    def __init__(self, nf: int, gc: int = 16):
        super().__init__()
        self.conv1 = nn.Conv2d(nf, gc, 3, 1, 1)
        self.conv2 = nn.Conv2d(nf + gc, gc, 3, 1, 1)
        self.conv3 = nn.Conv2d(nf + 2 * gc, gc, 3, 1, 1)
        self.conv4 = nn.Conv2d(nf + 3 * gc, gc, 3, 1, 1)
        self.conv5 = nn.Conv2d(nf + 4 * gc, nf, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, inplace=True)

    def forward(self, x: torch.Tensor):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class ESRGANDiscriminator(nn.Module):
    """
    Discriminator for adversarial training (optional).
    Only used during training, not exported.
    """

    def __init__(self, in_channels: int = 3, num_features: int = 32):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(in_channels, num_features, 3, 1, 1),
            nn.LeakyReLU(0.2, inplace=True),
            nn.Conv2d(num_features, num_features, 4, 2, 1),
            nn.BatchNorm2d(num_features),
            nn.LeakyReLU(0.2, inplace=True),
            nn.Conv2d(num_features, num_features * 2, 3, 1, 1),
            nn.BatchNorm2d(num_features * 2),
            nn.LeakyReLU(0.2, inplace=True),
            nn.Conv2d(num_features * 2, num_features * 2, 4, 2, 1),
            nn.BatchNorm2d(num_features * 2),
            nn.LeakyReLU(0.2, inplace=True),
            nn.Conv2d(num_features * 2, num_features * 4, 3, 1, 1),
            nn.BatchNorm2d(num_features * 4),
            nn.LeakyReLU(0.2, inplace=True),
            nn.Conv2d(num_features * 4, num_features * 4, 4, 2, 1),
            nn.BatchNorm2d(num_features * 4),
            nn.LeakyReLU(0.2, inplace=True),
            nn.AdaptiveAvgPool2d(1),
            nn.Conv2d(num_features * 4, num_features * 8, 1),
            nn.LeakyReLU(0.2, inplace=True),
            nn.Conv2d(num_features * 8, 1, 1),
            nn.Flatten(),
        )

    def forward(self, x: torch.Tensor):
        return self.net(x)
