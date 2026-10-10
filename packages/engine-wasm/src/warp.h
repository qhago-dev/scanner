// SPDX-License-Identifier: MIT
#pragma once

#include <cstdint>

namespace qhago {

// Homografía 3×3 (fila mayor) que lleva el rectángulo destino [0,W]×[0,H] al cuadrilátero de origen.
struct Homography {
  double m[9];
  void Apply(double x, double y, float& ox, float& oy) const;
};

// q = TL, TR, BR, BL (x, y) en píxeles del origen.
Homography RectToQuad(const float q[8], int W, int H);

// Warp bilineal: dst[W×H] (luma) ← src (luma si channels == 1, RGBA si 4; stride en bytes).
// Fuera de la imagen se rellena con 255 (zona de silencio blanca).
void WarpQuad(const uint8_t* src, int w, int h, int stride, int channels, const Homography& hm, uint8_t* dst,
              int W, int H);

}  // namespace qhago
