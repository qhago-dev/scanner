// Preproceso clásico y determinista (ADR-03: nada de restauración generativa).
// SPDX-License-Identifier: MIT
#include "qhago_engine.h"

#include <algorithm>
#include <cmath>

namespace qhago {

// Luminancia BT.601 en enteros: Y = (77 R + 150 G + 29 B) >> 8.
void RgbaToLuma(const uint8_t* rgba, int w, int h, int stride, uint8_t* out) {
  for (int y = 0; y < h; ++y) {
    const uint8_t* row = rgba + static_cast<size_t>(y) * stride;
    uint8_t* dst = out + static_cast<size_t>(y) * w;
    for (int x = 0; x < w; ++x) {
      const uint8_t* p = row + x * 4;
      dst[x] = static_cast<uint8_t>((77 * p[0] + 150 * p[1] + 29 * p[2]) >> 8);
    }
  }
}

Luma Crop(const uint8_t* src, int srcW, int x, int y, int w, int h) {
  Luma out(w, h);
  for (int r = 0; r < h; ++r)
    std::copy_n(src + static_cast<size_t>(y + r) * srcW + x, w, out.px.data() + static_cast<size_t>(r) * w);
  return out;
}

// CLAHE: ecualización de histograma por tiles con recorte, interpolación bilineal entre tiles.
Luma Clahe(const uint8_t* src, int w, int h, int tiles, float clip) {
  Luma out(w, h);
  const int tx = std::max(1, std::min(tiles, w / 8)), ty = std::max(1, std::min(tiles, h / 8));
  const int tw = (w + tx - 1) / tx, th = (h + ty - 1) / ty;
  std::vector<uint8_t> lut(static_cast<size_t>(tx) * ty * 256);

  for (int j = 0; j < ty; ++j) {
    for (int i = 0; i < tx; ++i) {
      int hist[256] = {0};
      const int x0 = i * tw, y0 = j * th, x1 = std::min(w, x0 + tw), y1 = std::min(h, y0 + th);
      const int n = std::max(1, (x1 - x0) * (y1 - y0));
      for (int y = y0; y < y1; ++y)
        for (int x = x0; x < x1; ++x) ++hist[src[static_cast<size_t>(y) * w + x]];
      const int limit = std::max(1, static_cast<int>(clip * n / 256.0f));
      int excess = 0;
      for (int& v : hist)
        if (v > limit) { excess += v - limit; v = limit; }
      const int add = excess / 256;
      int acc = 0;
      uint8_t* l = &lut[(static_cast<size_t>(j) * tx + i) * 256];
      for (int v = 0; v < 256; ++v) {
        acc += hist[v] + add;
        l[v] = static_cast<uint8_t>(std::min(255, acc * 255 / n));
      }
    }
  }

  for (int y = 0; y < h; ++y) {
    const float fy = (y + 0.5f) / th - 0.5f;
    const int j0 = std::clamp(static_cast<int>(std::floor(fy)), 0, ty - 1), j1 = std::min(j0 + 1, ty - 1);
    const float wy = std::clamp(fy - j0, 0.0f, 1.0f);
    for (int x = 0; x < w; ++x) {
      const float fx = (x + 0.5f) / tw - 0.5f;
      const int i0 = std::clamp(static_cast<int>(std::floor(fx)), 0, tx - 1), i1 = std::min(i0 + 1, tx - 1);
      const float wx = std::clamp(fx - i0, 0.0f, 1.0f);
      const uint8_t v = src[static_cast<size_t>(y) * w + x];
      auto L = [&](int i, int j) { return lut[(static_cast<size_t>(j) * tx + i) * 256 + v]; };
      const float top = L(i0, j0) * (1 - wx) + L(i1, j0) * wx;
      const float bot = L(i0, j1) * (1 - wx) + L(i1, j1) * wx;
      out.px[static_cast<size_t>(y) * w + x] = static_cast<uint8_t>(top * (1 - wy) + bot * wy + 0.5f);
    }
  }
  return out;
}

// Unsharp mask con desenfoque de caja 3x3 (separable): out = src + amount * (src - blur).
Luma Unsharp(const uint8_t* src, int w, int h, float amount) {
  Luma tmp(w, h), out(w, h);
  for (int y = 0; y < h; ++y)
    for (int x = 0; x < w; ++x) {
      const int a = src[static_cast<size_t>(y) * w + std::max(0, x - 1)];
      const int b = src[static_cast<size_t>(y) * w + x];
      const int c = src[static_cast<size_t>(y) * w + std::min(w - 1, x + 1)];
      tmp.px[static_cast<size_t>(y) * w + x] = static_cast<uint8_t>((a + b + c) / 3);
    }
  for (int y = 0; y < h; ++y)
    for (int x = 0; x < w; ++x) {
      const int a = tmp.px[static_cast<size_t>(std::max(0, y - 1)) * w + x];
      const int b = tmp.px[static_cast<size_t>(y) * w + x];
      const int c = tmp.px[static_cast<size_t>(std::min(h - 1, y + 1)) * w + x];
      const float blur = (a + b + c) / 3.0f;
      const float v = src[static_cast<size_t>(y) * w + x];
      out.px[static_cast<size_t>(y) * w + x] = static_cast<uint8_t>(std::clamp(v + amount * (v - blur), 0.0f, 255.0f));
    }
  return out;
}

namespace {
inline float Cubic(float x) {  // Catmull-Rom (a = -0.5)
  x = std::fabs(x);
  if (x < 1) return (1.5f * x - 2.5f) * x * x + 1;
  if (x < 2) return ((-0.5f * x + 2.5f) * x - 4) * x + 2;
  return 0;
}
}  // namespace

Luma ResizeBicubic(const uint8_t* src, int w, int h, int dw, int dh) {
  Luma out(dw, dh);
  const float sx = static_cast<float>(w) / dw, sy = static_cast<float>(h) / dh;
  // Al reducir, ampliamos el soporte del filtro para evitar aliasing.
  const float rx = std::max(1.0f, sx), ry = std::max(1.0f, sy);
  for (int y = 0; y < dh; ++y) {
    const float cy = (y + 0.5f) * sy - 0.5f;
    const int y0 = static_cast<int>(std::floor(cy - 2 * ry)) + 1, y1 = static_cast<int>(std::floor(cy + 2 * ry));
    for (int x = 0; x < dw; ++x) {
      const float cx = (x + 0.5f) * sx - 0.5f;
      const int x0 = static_cast<int>(std::floor(cx - 2 * rx)) + 1, x1 = static_cast<int>(std::floor(cx + 2 * rx));
      float acc = 0, wsum = 0;
      for (int yy = y0; yy <= y1; ++yy) {
        const float wy = Cubic((yy - cy) / ry);
        if (wy == 0) continue;
        const uint8_t* row = src + static_cast<size_t>(std::clamp(yy, 0, h - 1)) * w;
        for (int xx = x0; xx <= x1; ++xx) {
          const float wgt = wy * Cubic((xx - cx) / rx);
          acc += wgt * row[std::clamp(xx, 0, w - 1)];
          wsum += wgt;
        }
      }
      out.px[static_cast<size_t>(y) * dw + x] = static_cast<uint8_t>(std::clamp(acc / wsum + 0.5f, 0.0f, 255.0f));
    }
  }
  return out;
}

}  // namespace qhago
