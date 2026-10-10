import torch
import torch.nn as nn
import torch.nn.functional as F


class NanoDetBarcode(nn.Module):
    """
    Lightweight object detector based on NanoDet architecture (Apache 2.0).
    Modified for 4 barcode classes.
    Input: 320x320x3, Output: boxes[N,4], scores[N], classes[N]
    """

    def __init__(
        self,
        num_classes: int = 4,
        backbone_out_channels: int = 96,
        fpn_channels: int = 96,
    ):
        super().__init__()
        self.num_classes = num_classes

        self.backbone = ShuffleNetV2Backbone(out_channels=backbone_out_channels)

        self.fpn = LiteFPN(
            in_channels=[48, 96, 192],
            out_channels=fpn_channels,
        )

        self.head = NanoDetHead(
            in_channels=fpn_channels,
            num_classes=num_classes,
            strides=[8, 16, 32],
            reg_max=7,
        )

    def forward(self, x: torch.Tensor):
        features = self.backbone(x)
        fpn_features = self.fpn(features)
        boxes, scores, classes = self.head(fpn_features)
        return boxes, scores, classes

    def export_onnx(self, filepath: str):
        self.eval()
        dummy = torch.randn(1, 3, 320, 320)
        torch.onnx.export(
            self,
            dummy,
            filepath,
            input_names=["input"],
            output_names=["boxes", "scores", "classes"],
            dynamic_axes={"input": {0: "batch"}},
            opset_version=13,
        )


class ShuffleNetV2Backbone(nn.Module):
    """
    ShuffleNetV2-style backbone (BSD-licensed reimplementation).
    No code derived from any GPL/AGPL source.
    """

    def __init__(self, out_channels: int = 96):
        super().__init__()
        self.stage1 = nn.Sequential(
            nn.Conv2d(3, 24, 3, 2, 1, bias=False),
            nn.BatchNorm2d(24),
            nn.ReLU(inplace=True),
        )
        self.stage1_pool = nn.MaxPool2d(3, 2, 1)

        self.stage2 = self._make_stage(24, 48, 4)
        self.stage3 = self._make_stage(48, 96, 8)
        self.stage4 = self._make_stage(96, 192, 4)

    def _make_stage(
        self, in_ch: int, out_ch: int, blocks: int
    ) -> nn.Sequential:
        layers = []
        for i in range(blocks):
            stride = 2 if i == 0 else 1
            layers.append(
                ShuffleV2Block(
                    in_ch if i == 0 else out_ch,
                    out_ch,
                    stride=stride,
                )
            )
        return nn.Sequential(*layers)

    def forward(self, x: torch.Tensor):
        c2 = self.stage2(self.stage1_pool(self.stage1(x)))
        c3 = self.stage3(c2)
        c4 = self.stage4(c3)
        return [c2, c3, c4]


class ShuffleV2Block(nn.Module):
    def __init__(self, inp: int, oup: int, stride: int = 1):
        super().__init__()
        self.stride = stride
        branch_features = oup // 2

        if stride == 1:
            assert inp == oup

        self.branch1 = nn.Sequential(
            nn.Conv2d(
                inp if stride > 1 else branch_features,
                branch_features,
                1,
                1,
                0,
                bias=False,
            ),
            nn.BatchNorm2d(branch_features),
            nn.ReLU(inplace=True),
            nn.Conv2d(
                branch_features,
                branch_features,
                3,
                stride,
                1,
                groups=branch_features,
                bias=False,
            ),
            nn.BatchNorm2d(branch_features),
            nn.Conv2d(branch_features, branch_features, 1, 1, 0, bias=False),
            nn.BatchNorm2d(branch_features),
            nn.ReLU(inplace=True),
        )

        if stride == 1:
            self.branch2 = nn.Identity()
        else:
            self.branch2 = nn.Sequential(
                nn.Conv2d(
                    inp,
                    inp,
                    3,
                    stride,
                    1,
                    groups=inp,
                    bias=False,
                ),
                nn.BatchNorm2d(inp),
                nn.Conv2d(inp, branch_features, 1, 1, 0, bias=False),
                nn.BatchNorm2d(branch_features),
                nn.ReLU(inplace=True),
            )

    @staticmethod
    def channel_shuffle(x: torch.Tensor, groups: int):
        batch, channels, height, width = x.shape
        channels_per_group = channels // groups
        x = x.view(batch, groups, channels_per_group, height, width)
        x = torch.transpose(x, 1, 2).contiguous()
        x = x.view(batch, -1, height, width)
        return x

    def forward(self, x: torch.Tensor):
        if self.stride == 1:
            x1, x2 = x.chunk(2, dim=1)
            out = torch.cat((self.branch1(x1), x2), dim=1)
        else:
            out = torch.cat(
                (self.branch1(x), self.branch2(x)), dim=1
            )
        out = self.channel_shuffle(out, 2)
        return out


class LiteFPN(nn.Module):
    """
    Lightweight Feature Pyramid Network.
    """

    def __init__(
        self,
        in_channels: list,
        out_channels: int,
    ):
        super().__init__()
        self.out_channels = out_channels

        self.lateral_convs = nn.ModuleList([
            nn.Conv2d(ic, out_channels, 1, bias=False) for ic in in_channels
        ])
        self.fpn_convs = nn.ModuleList([
            nn.Conv2d(out_channels, out_channels, 3, 1, 1, groups=out_channels, bias=False)
            for _ in in_channels
        ])

        for conv in self.lateral_convs:
            nn.init.kaiming_normal_(conv.weight, mode="fan_out")
        for conv in self.fpn_convs:
            nn.init.kaiming_normal_(conv.weight, mode="fan_out")

    def forward(self, features: list) -> list:
        laterals = [
            conv(feat) for conv, feat in zip(self.lateral_convs, features)
        ]

        for i in range(len(laterals) - 1, 0, -1):
            laterals[i - 1] += F.interpolate(
                laterals[i], size=laterals[i - 1].shape[2:], mode="nearest"
            )

        outs = [conv(lat) for conv, lat in zip(self.fpn_convs, laterals)]
        return outs


class NanoDetHead(nn.Module):
    """
    Detection head for NanoDet.
    Uses integral regression for bounding box prediction.
    """

    def __init__(
        self,
        in_channels: int,
        num_classes: int,
        strides: list,
        reg_max: int = 7,
    ):
        super().__init__()
        self.strides = strides
        self.reg_max = reg_max
        self.num_classes = num_classes

        self.cls_convs = nn.ModuleList()
        self.reg_convs = nn.ModuleList()

        for _ in strides:
            cls_conv = nn.Sequential(
                nn.Conv2d(in_channels, in_channels, 3, 1, 1, groups=in_channels, bias=False),
                nn.BatchNorm2d(in_channels),
                nn.ReLU(inplace=True),
                nn.Conv2d(
                    in_channels, in_channels, 3, 1, 1, groups=in_channels, bias=False,
                ),
                nn.BatchNorm2d(in_channels),
                nn.ReLU(inplace=True),
            )
            reg_conv = nn.Sequential(
                nn.Conv2d(in_channels, in_channels, 3, 1, 1, groups=in_channels, bias=False),
                nn.BatchNorm2d(in_channels),
                nn.ReLU(inplace=True),
                nn.Conv2d(
                    in_channels, in_channels, 3, 1, 1, groups=in_channels, bias=False,
                ),
                nn.BatchNorm2d(in_channels),
                nn.ReLU(inplace=True),
            )
            self.cls_convs.append(cls_conv)
            self.reg_convs.append(reg_conv)

        self.cls_head = nn.Conv2d(in_channels, num_classes, 1)
        self.reg_head = nn.Conv2d(in_channels, 4 * (reg_max + 1), 1)

        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.normal_(m.weight, 0, 0.01)
                if m.bias is not None:
                    nn.init.constant_(m.bias, 0)

    def forward(self, features: list):
        all_boxes = []
        all_scores = []
        all_classes = []

        for idx, feat in enumerate(features):
            cls_feat = self.cls_convs[idx](feat)
            reg_feat = self.reg_convs[idx](feat)

            cls_pred = self.cls_head(cls_feat)
            reg_pred = self.reg_head(reg_feat)

            B, C, H, W = cls_pred.shape
            cls_pred = cls_pred.permute(0, 2, 3, 1).reshape(B, -1, self.num_classes)
            reg_pred = reg_pred.permute(0, 2, 3, 1).reshape(B, -1, 4 * (self.reg_max + 1))

            scores, classes = cls_pred.sigmoid().max(dim=-1)

            stride = self.strides[idx]

            xs = torch.arange(W, device=feat.device, dtype=torch.float32)
            ys = torch.arange(H, device=feat.device, dtype=torch.float32)
            grid_y, grid_x = torch.meshgrid(ys, xs, indexing="ij")
            grid = torch.stack([grid_x, grid_y, grid_x, grid_y], dim=-1).reshape(-1, 4)

            grid = grid.unsqueeze(0).expand(B, -1, -1)

            boxes = self._integral_decode(reg_pred, grid * stride, stride)

            all_boxes.append(boxes)
            all_scores.append(scores)
            all_classes.append(classes)

        boxes = torch.cat(all_boxes, dim=1)
        scores = torch.cat(all_scores, dim=1)
        classes = torch.cat(all_classes, dim=1)

        return boxes, scores, classes

    def _integral_decode(
        self,
        pred: torch.Tensor,
        grid: torch.Tensor,
        stride: float,
    ) -> torch.Tensor:
        reg_max = self.reg_max
        B, N, _ = pred.shape
        pred = pred.view(B, N, 4, reg_max + 1)

        proj = torch.linspace(0, reg_max, reg_max + 1, device=pred.device)
        weights = pred.softmax(dim=-1)
        offsets = (weights * proj).sum(dim=-1)

        boxes = grid + offsets * stride
        return boxes
