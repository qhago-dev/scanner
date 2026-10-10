"""CenterNet-lite (F5, ADR-04 "o equivalente"): detector de códigos con keypoints, propio (MIT).

Entrada: 1 canal (luminancia) 320×320 en [0, 1]. Salidas a stride 4 (80×80):
  heat    [B, C, 80, 80]  probabilidad de centro por clase (sigmoid incluida)
  offset  [B, 2, 80, 80]  desplazamiento sub-celda del centro (en celdas)
  corners [B, 8, 80, 80]  4 esquinas relativas al centro, en unidades de CORNER_SCALE píxeles de entrada
Sin pesos preentrenados (evita licencias de ImageNet). Solo Conv/BN/ReLU/Upsample: exporta a ONNX sin ops raros.
"""

from __future__ import annotations

import torch
from torch import nn

NUM_CLASSES = 5
STRIDE = 4
CORNER_SCALE = 32.0
INPUT = 320


def conv_bn(cin: int, cout: int, k: int = 3, s: int = 1, groups: int = 1) -> nn.Sequential:
    return nn.Sequential(nn.Conv2d(cin, cout, k, s, k // 2, groups=groups, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True))


class DW(nn.Module):
    """Depthwise 3×3 + pointwise 1×1 (con residual si las formas coinciden)."""

    def __init__(self, cin: int, cout: int, s: int = 1) -> None:
        super().__init__()
        self.dw = conv_bn(cin, cin, 3, s, groups=cin)
        self.pw = conv_bn(cin, cout, 1)
        self.res = s == 1 and cin == cout

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        y = self.pw(self.dw(x))
        return x + y if self.res else y


class CenterNetLite(nn.Module):
    def __init__(self, num_classes: int = NUM_CLASSES, width: float = 1.5, neck: int = 80, head: str = "full") -> None:
        """head="full": 3 cabezas conv 3×3 (v1, ~1,1 GMAC a 80×80). head="shared": un bloque DW compartido + 1×1
        por salida (~10× menos cómputo en las cabezas; pensado para WASM en móviles)."""
        super().__init__()
        self.head_kind = head
        c = [int(v * width) for v in (16, 32, 64, 96, 128)]
        self.stem = conv_bn(1, c[0], 3, 2)  # /2
        self.s4 = nn.Sequential(DW(c[0], c[1], 2), DW(c[1], c[1]))  # /4
        self.s8 = nn.Sequential(DW(c[1], c[2], 2), DW(c[2], c[2]))  # /8
        self.s16 = nn.Sequential(DW(c[2], c[3], 2), DW(c[3], c[3]), DW(c[3], c[3]))  # /16
        self.s32 = nn.Sequential(DW(c[3], c[4], 2), DW(c[4], c[4]))  # /32
        n = neck
        self.l32 = conv_bn(c[4], n, 1)
        self.l16 = conv_bn(c[3], n, 1)
        self.l8 = conv_bn(c[2], n, 1)
        self.l4 = conv_bn(c[1], n, 1)
        self.f16, self.f8, self.f4 = DW(n, n), DW(n, n), DW(n, n)
        self.up = nn.Upsample(scale_factor=2, mode="nearest")

        def make_head(out: int, bias: float = 0.0) -> nn.Module:
            h = nn.Sequential(conv_bn(n, n, 3), nn.Conv2d(n, out, 1)) if head == "full" else nn.Conv2d(n, out, 1)
            last = h[-1] if isinstance(h, nn.Sequential) else h
            nn.init.constant_(last.bias, bias)
            return h

        self.shared = DW(n, n) if head == "shared" else nn.Identity()
        self.heat = make_head(num_classes, -2.19)  # prior ~0.1 (CenterNet)
        self.offset = make_head(2)
        self.corners = make_head(8)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        x4 = self.s4(self.stem(x))
        x8 = self.s8(x4)
        x16 = self.s16(x8)
        x32 = self.s32(x16)
        p = self.l32(x32)
        p = self.f16(self.up(p) + self.l16(x16))
        p = self.f8(self.up(p) + self.l8(x8))
        p = self.shared(self.f4(self.up(p) + self.l4(x4)))
        return torch.sigmoid(self.heat(p)), self.offset(p), self.corners(p)


def decode(heat: torch.Tensor, offset: torch.Tensor, corners: torch.Tensor, k: int = 20, thr: float = 0.3):
    """Picos locales (max-pool 3×3) → [(cls, score, corners[4,2] en px de entrada)] por imagen."""
    peaks = (heat == nn.functional.max_pool2d(heat, 3, 1, 1)) & (heat >= thr)
    out = []
    for b in range(heat.shape[0]):
        cls, ys, xs = torch.nonzero(peaks[b], as_tuple=True)
        scores = heat[b, cls, ys, xs]
        order = torch.argsort(scores, descending=True)[:k]
        dets = []
        for i in order.tolist():
            y, x, c = ys[i].item(), xs[i].item(), cls[i].item()
            cx = (x + offset[b, 0, y, x].item()) * STRIDE
            cy = (y + offset[b, 1, y, x].item()) * STRIDE
            rel = corners[b, :, y, x].view(4, 2) * CORNER_SCALE
            pts = rel + torch.tensor([cx, cy], device=rel.device)
            dets.append((c, scores[i].item(), pts.cpu().numpy()))
        out.append(dets)
    return out


if __name__ == "__main__":
    for kind in ("full", "shared"):
        m = CenterNetLite(head=kind)
        print(kind, sum(p.numel() for p in m.parameters()) / 1e6, "M parámetros")
    print([t.shape for t in m(torch.zeros(1, 1, INPUT, INPUT))])
