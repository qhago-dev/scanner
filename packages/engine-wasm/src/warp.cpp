// SPDX-License-Identifier: MIT
// Homografía cuadrado→cuadrilátero de forma cerrada (Heckbert 1989, "Fundamentals of Texture Mapping", 2.2.3).
#include "warp.h"

#include <cmath>
#include <cstddef>

namespace qhago {

void Homography::Apply(double x, double y, float& ox, float& oy) const {
  const double w = m[6] * x + m[7] * y + m[8];
  ox = static_cast<float>((m[0] * x + m[1] * y + m[2]) / w);
  oy = static_cast<float>((m[3] * x + m[4] * y + m[5]) / w);
}

Homography RectToQuad(const float q[8], int W, int H) {
  const double x0 = q[0], y0 = q[1], x1 = q[2], y1 = q[3], x2 = q[4], y2 = q[5], x3 = q[6], y3 = q[7];
  const double sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  double a, b, c, d, e, f, g, h;
  if (std::fabs(sx) < 1e-9 && std::fabs(sy) < 1e-9) {  // afín
    a = x1 - x0; b = x2 - x1; c = x0;
    d = y1 - y0; e = y2 - y1; f = y0;
    g = 0; h = 0;
  } else {
    const double dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
    const double den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den;
    h = (dx1 * sy - sx * dy1) / den;
    a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; c = x0;
    d = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0;
  }
  // Cuadrado unidad → cuadrilátero; se compone con la escala (x/W, y/H).
  Homography out{{a / W, b / H, c, d / W, e / H, f, g / W, h / H, 1.0}};
  return out;
}

void WarpQuad(const uint8_t* src, int w, int h, int stride, int channels, const Homography& hm, uint8_t* dst,
              int W, int H) {
  auto px = [&](int x, int y) -> float {
    if (x < 0 || y < 0 || x >= w || y >= h) return 255.f;
    const uint8_t* p = src + static_cast<std::size_t>(y) * stride + static_cast<std::size_t>(x) * channels;
    // Misma ponderación que RgbaToLuma (BT.601 entera).
    return channels == 1 ? p[0] : (77.f * p[0] + 150.f * p[1] + 29.f * p[2]) / 256.f;
  };
  for (int v = 0; v < H; ++v) {
    for (int u = 0; u < W; ++u) {
      float sx, sy;
      hm.Apply(u + 0.5, v + 0.5, sx, sy);
      sx -= 0.5f;
      sy -= 0.5f;
      const int ix = static_cast<int>(std::floor(sx)), iy = static_cast<int>(std::floor(sy));
      const float fx = sx - ix, fy = sy - iy;
      const float top = px(ix, iy) * (1 - fx) + px(ix + 1, iy) * fx;
      const float bot = px(ix, iy + 1) * (1 - fx) + px(ix + 1, iy + 1) * fx;
      const float val = top * (1 - fy) + bot * fy;
      dst[static_cast<std::size_t>(v) * W + u] = static_cast<uint8_t>(val < 0 ? 0 : val > 255 ? 255 : val + 0.5f);
    }
  }
}

}  // namespace qhago
