import torch
import torch.nn as nn
import torch.nn.functional as F


class DeblurCNN(nn.Module):
    """
    Lightweight UNet for barcode deblurring.
    128x128x3 input → 128x128x3 output.
    Trained on synthetic blur/sharp pairs of barcode images.
    """

    def __init__(self, in_channels: int = 3, base_channels: int = 32):
        super().__init__()
        self.in_channels = in_channels
        self.base_channels = base_channels

        self.enc1 = self._conv_block(in_channels, base_channels)
        self.enc2 = self._conv_block(base_channels, base_channels * 2)
        self.enc3 = self._conv_block(base_channels * 2, base_channels * 4)

        self.pool = nn.MaxPool2d(2, 2)

        self.bottleneck = self._conv_block(
            base_channels * 4, base_channels * 8
        )

        self.up3 = nn.ConvTranspose2d(base_channels * 8, base_channels * 4, 2, 2)
        self.dec3 = self._conv_block(base_channels * 8, base_channels * 4)

        self.up2 = nn.ConvTranspose2d(base_channels * 4, base_channels * 2, 2, 2)
        self.dec2 = self._conv_block(base_channels * 4, base_channels * 2)

        self.up1 = nn.ConvTranspose2d(base_channels * 2, base_channels, 2, 2)
        self.dec1 = self._conv_block(base_channels * 2, base_channels)

        self.final = nn.Sequential(
            nn.Conv2d(base_channels, base_channels, 3, 1, 1),
            nn.ReLU(inplace=True),
            nn.Conv2d(base_channels, in_channels, 3, 1, 1),
            nn.Sigmoid(),
        )

    def _conv_block(self, in_ch: int, out_ch: int) -> nn.Sequential:
        return nn.Sequential(
            nn.Conv2d(in_ch, out_ch, 3, 1, 1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, 3, 1, 1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
        )

    def forward(self, x: torch.Tensor):
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool(e1))
        e3 = self.enc3(self.pool(e2))

        b = self.bottleneck(self.pool(e3))

        d3 = self.dec3(torch.cat([self.up3(b), e3], dim=1))
        d2 = self.dec2(torch.cat([self.up2(d3), e2], dim=1))
        d1 = self.dec1(torch.cat([self.up1(d2), e1], dim=1))

        return self.final(d1)

    def export_onnx(self, filepath: str):
        self.eval()
        dummy = torch.randn(1, self.in_channels, 128, 128)
        torch.onnx.export(
            self,
            dummy,
            filepath,
            input_names=["input"],
            output_names=["output"],
            opset_version=13,
        )


class BlurLoss(nn.Module):
    """
    Combined loss for deblurring: L1 + perceptual + edge.
    """

    def __init__(self, alpha_l1: float = 0.6, alpha_edge: float = 0.4):
        super().__init__()
        self.alpha_l1 = alpha_l1
        self.alpha_edge = alpha_edge
        self.l1 = nn.L1Loss()

    def forward(self, pred: torch.Tensor, target: torch.Tensor):
        loss_l1 = self.l1(pred, target)

        sobel_x = torch.tensor(
            [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]],
            dtype=torch.float32,
            device=pred.device,
        ).view(1, 1, 3, 3).repeat(pred.shape[1], 1, 1, 1)

        sobel_y = torch.tensor(
            [[-1, -2, -1], [0, 0, 0], [1, 2, 1]],
            dtype=torch.float32,
            device=pred.device,
        ).view(1, 1, 3, 3).repeat(pred.shape[1], 1, 1, 1)

        pred_grad_x = F.conv2d(
            torch.mean(pred, dim=1, keepdim=True), sobel_x, padding=1
        )
        pred_grad_y = F.conv2d(
            torch.mean(pred, dim=1, keepdim=True), sobel_y, padding=1
        )
        target_grad_x = F.conv2d(
            torch.mean(target, dim=1, keepdim=True), sobel_x, padding=1
        )
        target_grad_y = F.conv2d(
            torch.mean(target, dim=1, keepdim=True), sobel_y, padding=1
        )

        loss_edge = self.l1(pred_grad_x, target_grad_x) + self.l1(
            pred_grad_y, target_grad_y
        )

        return self.alpha_l1 * loss_l1 + self.alpha_edge * loss_edge
