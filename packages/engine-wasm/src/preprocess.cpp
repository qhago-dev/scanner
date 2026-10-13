// Preproceso clásico y determinista (ADR-03: nada de restauración generativa).
// SPDX-License-Identifier: MIT
#include "qhago_engine.h"

#include <algorithm>
#include <cmath>
#include <vector>

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

namespace {
// Pesos de un eje: para cada píxel de salida, el primer índice de origen (ya recortado al borde) y sus pesos
// normalizados. Mismo núcleo y soporte que la versión 2D original (Catmull-Rom, ampliado al reducir).
struct AxisTaps {
  std::vector<int> start, count;
  std::vector<int> index;    // índices de origen (recortados) concatenados
  std::vector<float> weight;  // pesos normalizados concatenados
};

AxisTaps MakeTaps(int n, int dn) {
  AxisTaps t;
  t.start.resize(dn);
  t.count.resize(dn);
  const float s = static_cast<float>(n) / dn;
  const float r = std::max(1.0f, s);
  for (int o = 0; o < dn; ++o) {
    const float c = (o + 0.5f) * s - 0.5f;
    const int i0 = static_cast<int>(std::floor(c - 2 * r)) + 1, i1 = static_cast<int>(std::floor(c + 2 * r));
    t.start[o] = static_cast<int>(t.index.size());
    float sum = 0;
    for (int i = i0; i <= i1; ++i) sum += Cubic((i - c) / r);
    for (int i = i0; i <= i1; ++i) {
      const float wgt = Cubic((i - c) / r);
      if (wgt == 0) continue;
      t.index.push_back(std::clamp(i, 0, n - 1));
      t.weight.push_back(wgt / sum);
    }
    t.count[o] = static_cast<int>(t.index.size()) - t.start[o];
  }
  return t;
}
}  // namespace

// Separable (horizontal y luego vertical) con pesos precalculados: el mismo filtro que el 2D original, ~10×
// más rápido (una foto de 6,6 MP reducida a 2560 px pasaba de ~315 ms a decenas de ms). Las filas filtradas en
// horizontal se calculan bajo demanda y se descartan cuando ya no se usan (memoria ≈ soporte × ancho de salida).
Luma ResizeBicubic(const uint8_t* src, int w, int h, int dw, int dh) {
  Luma out(dw, dh);
  const AxisTaps tx = MakeTaps(w, dw);
  const AxisTaps ty = MakeTaps(h, dh);
  std::vector<std::vector<float>> rows(h);
  int lowest = 0;  // filas < lowest ya liberadas
  auto row = [&](int y) -> const std::vector<float>& {
    std::vector<float>& r = rows[y];
    if (r.empty()) {
      r.resize(dw);
      const uint8_t* s = src + static_cast<size_t>(y) * w;
      for (int x = 0; x < dw; ++x) {
        float acc = 0;
        const int b = tx.start[x];
        for (int k = 0; k < tx.count[x]; ++k) acc += tx.weight[b + k] * s[tx.index[b + k]];
        r[x] = acc;
      }
    }
    return r;
  };
  std::vector<float> acc(dw);
  for (int y = 0; y < dh; ++y) {
    const int b = ty.start[y], n = ty.count[y];
    // Libera las filas que ya no usará ninguna salida posterior (los índices de origen crecen con y).
    int minIdx = h;
    for (int k = 0; k < n; ++k) minIdx = std::min(minIdx, ty.index[b + k]);
    for (; lowest < minIdx; ++lowest) std::vector<float>().swap(rows[lowest]);
    std::fill(acc.begin(), acc.end(), 0.0f);
    for (int k = 0; k < n; ++k) {
      const std::vector<float>& r = row(ty.index[b + k]);
      const float wgt = ty.weight[b + k];
      for (int x = 0; x < dw; ++x) acc[x] += wgt * r[x];
    }
    uint8_t* dst = out.px.data() + static_cast<size_t>(y) * dw;
    for (int x = 0; x < dw; ++x) dst[x] = static_cast<uint8_t>(std::clamp(acc[x] + 0.5f, 0.0f, 255.0f));
  }
  return out;
}

}  // namespace qhago
