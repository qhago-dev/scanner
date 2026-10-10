// libFuzzer sobre la ABI C del motor (F6.5): lo mismo que puede hacer un JS hostil o con bugs.
// Byte 0 = modo (luma | rgba | quad | imagen codificada), 1-2 = tamaño, 3.. = opciones, resto = píxeles.
// SPDX-License-Identifier: MIT
#include <cstdint>
#include <cstring>

#include "qhago_engine.h"

extern "C" {
uint8_t* sa_alloc_input(uint32_t bytes);
int32_t* sa_options_ptr(void);
int32_t sa_read(const uint8_t* luma, int32_t w, int32_t h, const int32_t* opts);
int32_t sa_read_rgba(const uint8_t* rgba, int32_t w, int32_t h, int32_t stride, const int32_t* opts);
float* sa_quad_ptr(void);
int32_t sa_read_quad(const uint8_t* src, int32_t w, int32_t h, int32_t stride, int32_t channels, int32_t dstW,
                     int32_t dstH, const int32_t* opts);
uint8_t* sa_decode_image(const uint8_t* data, uint32_t len);
const char* sa_result_json(void);
}

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* d, size_t n) {
  constexpr size_t kHead = 3 + qhago::kOptCount * 2;
  if (n < kHead + 1) return 0;
  const int mode = d[0] % 4;
  const int w = 1 + d[1] % 160, h = 1 + d[2] % 160;
  int32_t* opts = sa_options_ptr();
  for (int i = 0; i < qhago::kOptCount; ++i) {
    // 16 bits con signo: valores fuera de rango, negativos y enormes relativos al tamaño.
    int16_t v;
    std::memcpy(&v, d + 3 + 2 * i, 2);
    opts[i] = v;
  }
  opts[qhago::kTimeBudgetMs] = 50;  // acota el tiempo por entrada (sigue fuzzeando el resto)
  const uint8_t* p = d + kHead;
  const size_t pn = n - kHead;
  auto fill = [&](uint8_t* dst, size_t len) {
    for (size_t i = 0; i < len; ++i) dst[i] = p[i % pn];
  };
  switch (mode) {
    case 0: {
      uint8_t* buf = sa_alloc_input(static_cast<uint32_t>(w * h));
      fill(buf, static_cast<size_t>(w) * h);
      sa_read(buf, w, h, opts);
      break;
    }
    case 1: {
      const int stride = w * 4 + (p[0] % 8);
      uint8_t* buf = sa_alloc_input(static_cast<uint32_t>(stride * h));
      fill(buf, static_cast<size_t>(stride) * h);
      sa_read_rgba(buf, w, h, stride, opts);
      break;
    }
    case 2: {
      const int channels = (p[0] & 1) ? 4 : 1;
      const int stride = w * channels;
      uint8_t* buf = sa_alloc_input(static_cast<uint32_t>(stride * h));
      fill(buf, static_cast<size_t>(stride) * h);
      float* q = sa_quad_ptr();
      for (int i = 0; i < 8; ++i) {
        int16_t v;
        std::memcpy(&v, d + 3 + (2 * i) % (qhago::kOptCount * 2), 2);
        q[i] = static_cast<float>(v) / 64.f;  // −512..512 px: dentro, fuera y degenerados
      }
      sa_read_quad(buf, w, h, stride, channels, 1 + p[pn > 1 ? 1 : 0] % 200, 1 + p[pn > 2 ? 2 : 0] % 200, opts);
      break;
    }
    default:
      sa_decode_image(p, static_cast<uint32_t>(pn));
  }
  volatile size_t len = std::strlen(sa_result_json());
  (void)len;
  return 0;
}
