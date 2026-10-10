// ABI C del motor Qhago (versión kAbiVersion). Lo consume packages/scanner/src/engine.
//
// Flujo desde JS:
//   ptr = sa_alloc_input(bytes)            buffer de entrada reutilizable (crece, no encoge)
//   escribir luma o RGBA en HEAPU8[ptr…]   (obtener HEAPU8 justo antes: memory growth invalida vistas)
//   opts = sa_options_ptr()                escribir kOptCount int32 (ver qhago_engine.h)
//   n = sa_read(ptr, w, h, opts) | sa_read_rgba(ptr, w, h, stride, opts)
//   json = UTF8ToString(sa_result_json())
// SPDX-License-Identifier: MIT
#include "cascade.h"
#include "warp.h"

#include <cstdio>
#include <cstring>
#include <exception>
#include <string>
#include <vector>

#ifdef QHAGO_WITH_IMAGE_DECODER
extern "C" unsigned char* stbi_load_from_memory(const unsigned char* buffer, int len, int* x, int* y,
                                                int* comp, int req_comp);
extern "C" void stbi_image_free(void* retval_from_stbi_load);
extern "C" const char* stbi_failure_reason(void);
#endif

namespace {

std::vector<uint8_t> g_input;
std::vector<uint8_t> g_luma;
std::vector<uint8_t> g_warp;
float g_quad[8];
int32_t g_options[qhago::kOptCount];
std::string g_json;
int g_imageW = 0, g_imageH = 0;

void Escape(std::string& s, const std::string& v) {
  s += '"';
  for (unsigned char c : v) {
    switch (c) {
      case '"': s += "\\\""; break;
      case '\\': s += "\\\\"; break;
      case '\n': s += "\\n"; break;
      case '\r': s += "\\r"; break;
      case '\t': s += "\\t"; break;
      default:
        if (c < 0x20) {
          char buf[8];
          std::snprintf(buf, sizeof buf, "\\u%04x", c);
          s += buf;
        } else {
          s += static_cast<char>(c);
        }
    }
  }
  s += '"';
}

void Base64(std::string& s, const std::vector<uint8_t>& d) {
  static const char* T = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  s += '"';
  size_t i = 0;
  for (; i + 2 < d.size(); i += 3) {
    const uint32_t v = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    s += T[v >> 18]; s += T[(v >> 12) & 63]; s += T[(v >> 6) & 63]; s += T[v & 63];
  }
  if (i + 1 == d.size()) {
    const uint32_t v = d[i] << 16;
    s += T[v >> 18]; s += T[(v >> 12) & 63]; s += "==";
  } else if (i + 2 == d.size()) {
    const uint32_t v = (d[i] << 16) | (d[i + 1] << 8);
    s += T[v >> 18]; s += T[(v >> 12) & 63]; s += T[(v >> 6) & 63]; s += '=';
  }
  s += '"';
}

void Points(std::string& s, const float* p) {
  s += '[';
  for (int i = 0; i < 8; ++i) {
    char buf[24];
    std::snprintf(buf, sizeof buf, "%s%.1f", i ? "," : "", p[i]);
    s += buf;
  }
  s += ']';
}

void Serialize(const qhago::Outcome& o) {
  std::string& s = g_json;
  s.clear();
  s += "{\"results\":[";
  for (size_t i = 0; i < o.results.size(); ++i) {
    const auto& r = o.results[i];
    if (i) s += ',';
    s += "{\"format\":\"";
    s += qhago::kFormatNames[r.format];
    s += "\",\"text\":";
    Escape(s, r.text);
    s += ",\"bytes\":";
    Base64(s, r.bytes);
    s += ",\"points\":";
    Points(s, r.pts);
    s += ",\"orientation\":" + std::to_string(r.orientation);
    s += ",\"mirrored\":";
    s += r.mirrored ? "true" : "false";
    s += ",\"inverted\":";
    s += r.inverted ? "true" : "false";
    s += ",\"ecLevel\":";
    Escape(s, r.ecLevel);
    s += ",\"symbologyId\":";
    Escape(s, r.symbologyId);
    s += ",\"contentType\":\"" + r.contentType + "\"";
    s += ",\"lineCount\":" + std::to_string(r.lineCount);
    s += ",\"pass\":\"" + r.pass + "\"}";
  }
  s += "],\"candidates\":[";
  for (size_t i = 0; i < o.candidates.size(); ++i) {
    const auto& c = o.candidates[i];
    if (i) s += ',';
    s += "{\"format\":\"";
    s += qhago::kFormatNames[c.format];
    s += "\",\"error\":\"" + c.error + "\",\"points\":";
    Points(s, c.pts);
    s += '}';
  }
  s += "],\"passes\":[";
  for (size_t i = 0; i < o.passes.size(); ++i) {
    if (i) s += ',';
    s += '"';
    s += o.passes[i];
    s += '"';
  }
  char tail[96];
  std::snprintf(tail, sizeof tail, "],\"budgetExceeded\":%s,\"ms\":%.3f}", o.budgetExceeded ? "true" : "false", o.ms);
  s += tail;
}

int32_t Fail(const char* what) {
  g_json = "{\"error\":";
  Escape(g_json, what);
  g_json += "}";
  return -1;
}

int32_t Read(const uint8_t* luma, int w, int h, const int32_t* opts, const qhago::Homography* back = nullptr) {
  if (!luma || w <= 0 || h <= 0) return Fail("invalid image");
  try {
    qhago::Outcome o = qhago::RunCascade(luma, w, h, opts ? opts : g_options);
    if (back) {  // puntos del rectángulo warpeado → imagen de origen
      for (auto* list : {&o.results, &o.candidates})
        for (auto& r : *list)
          for (int i = 0; i < 4; ++i) back->Apply(r.pts[2 * i], r.pts[2 * i + 1], r.pts[2 * i], r.pts[2 * i + 1]);
    }
    Serialize(o);
    return static_cast<int32_t>(o.results.size());
  } catch (const std::exception& e) {
    return Fail(e.what());
  } catch (...) {
    return Fail("unknown error");
  }
}

}  // namespace

extern "C" {

uint32_t sa_abi_version(void) { return qhago::kAbiVersion; }

uint8_t* sa_alloc_input(uint32_t bytes) {
  if (g_input.size() < bytes) g_input.resize(bytes);
  return g_input.data();
}

int32_t* sa_options_ptr(void) { return g_options; }

int32_t sa_read(const uint8_t* luma, int32_t w, int32_t h, const int32_t* opts) { return Read(luma, w, h, opts); }

int32_t sa_read_rgba(const uint8_t* rgba, int32_t w, int32_t h, int32_t stride, const int32_t* opts) {
  if (!rgba || w <= 0 || h <= 0 || stride < w * 4) return Fail("invalid image");
  g_luma.resize(static_cast<size_t>(w) * h);
  qhago::RgbaToLuma(rgba, w, h, stride, g_luma.data());
  return Read(g_luma.data(), w, h, opts);
}

const char* sa_result_json(void) { return g_json.c_str(); }

// ABI 2 (F5.5): lee el cuadrilátero g_quad (TL, TR, BR, BL, escrito vía sa_quad_ptr) rectificado a dstW×dstH.
// src es luma (channels 1) o RGBA (4); los puntos devueltos están en coordenadas de src.
float* sa_quad_ptr(void) { return g_quad; }

int32_t sa_read_quad(const uint8_t* src, int32_t w, int32_t h, int32_t stride, int32_t channels, int32_t dstW,
                     int32_t dstH, const int32_t* opts) {
  if (!src || w <= 0 || h <= 0 || (channels != 1 && channels != 4) || stride < w * channels || dstW <= 0 ||
      dstH <= 0 || static_cast<int64_t>(dstW) * dstH > 16'000'000)
    return Fail("invalid quad read");
  const qhago::Homography hm = qhago::RectToQuad(g_quad, dstW, dstH);
  g_warp.resize(static_cast<size_t>(dstW) * dstH);
  qhago::WarpQuad(src, w, h, stride, channels, hm, g_warp.data(), dstW, dstH);
  return Read(g_warp.data(), dstW, dstH, opts, &hm);
}

// Decodifica PNG/JPEG (solo build node). Deja la luma en el buffer interno y devuelve su puntero.
uint8_t* sa_decode_image(const uint8_t* data, uint32_t len) {
#ifdef QHAGO_WITH_IMAGE_DECODER
  int w = 0, h = 0, comp = 0;
  unsigned char* px = stbi_load_from_memory(data, static_cast<int>(len), &w, &h, &comp, 1);
  if (!px) {
    Fail(stbi_failure_reason());
    return nullptr;
  }
  g_luma.assign(px, px + static_cast<size_t>(w) * h);
  stbi_image_free(px);
  g_imageW = w;
  g_imageH = h;
  return g_luma.data();
#else
  (void)data;
  (void)len;
  Fail("image decoder not built in");
  return nullptr;
#endif
}

int32_t sa_image_width(void) { return g_imageW; }
int32_t sa_image_height(void) { return g_imageH; }

void sa_free(void) {
  std::vector<uint8_t>().swap(g_input);
  std::vector<uint8_t>().swap(g_luma);
  std::vector<uint8_t>().swap(g_warp);
  std::string().swap(g_json);
}

}  // extern "C"
