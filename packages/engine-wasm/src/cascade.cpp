// Cascada de estrategias (fast / balanced / thorough) con presupuesto de tiempo.
// Cada pasada lee una versión de la imagen; se detiene en la primera pasada con lecturas válidas.
// SPDX-License-Identifier: MIT
#include "cascade.h"

#include "ReadBarcode.h"

#include <algorithm>
#include <chrono>
#include <cmath>

namespace qhago {

const char* const kFormatNames[kFormatCount] = {
    "aztec", "codabar", "code_39", "code_93", "code_128", "data_matrix", "ean_8",
    "ean_13", "itf", "pdf417", "qr_code", "upc_a", "upc_e"};

namespace {

using ZXing::BarcodeFormat;

double NowMs() {
  using namespace std::chrono;
  return duration<double, std::milli>(steady_clock::now().time_since_epoch()).count();
}

// Formatos que se piden a ZXing por cada uno de los nuestros.
std::vector<BarcodeFormat> RequestedFormats(uint32_t mask) {
  if (mask == 0) mask = (1u << kFormatCount) - 1;
  std::vector<BarcodeFormat> f;
  auto on = [&](Format x) { return (mask >> x) & 1u; };
  if (on(kAztec)) f.push_back(BarcodeFormat::Aztec);
  if (on(kCodabar)) f.push_back(BarcodeFormat::Codabar);
  if (on(kCode39)) f.push_back(BarcodeFormat::Code39);
  if (on(kCode93)) f.push_back(BarcodeFormat::Code93);
  if (on(kCode128)) f.push_back(BarcodeFormat::Code128);
  if (on(kDataMatrix)) f.push_back(BarcodeFormat::DataMatrix);
  if (on(kEan8)) f.push_back(BarcodeFormat::EAN8);
  if (on(kEan13)) f.push_back(BarcodeFormat::EAN13);
  if (on(kItf)) f.push_back(BarcodeFormat::ITF);
  if (on(kPdf417)) f.push_back(BarcodeFormat::PDF417);
  if (on(kQrCode)) {
    f.push_back(BarcodeFormat::QRCodeModel1);
    f.push_back(BarcodeFormat::QRCodeModel2);
  }
  if (on(kUpcA)) f.push_back(BarcodeFormat::UPCA);
  if (on(kUpcE)) f.push_back(BarcodeFormat::UPCE);
  return f;
}

// Variante devuelta por ZXing → nuestro formato (-1 = no es uno de los 13).
int MapFormat(BarcodeFormat f) {
  switch (f) {
    case BarcodeFormat::AztecCode: case BarcodeFormat::AztecRune: case BarcodeFormat::Aztec: return kAztec;
    case BarcodeFormat::Codabar: return kCodabar;
    case BarcodeFormat::Code39: case BarcodeFormat::Code39Std: case BarcodeFormat::Code39Ext:
    case BarcodeFormat::Code32: case BarcodeFormat::PZN: return kCode39;
    case BarcodeFormat::Code93: return kCode93;
    case BarcodeFormat::Code128: return kCode128;
    case BarcodeFormat::DataMatrix: return kDataMatrix;
    case BarcodeFormat::EAN8: return kEan8;
    case BarcodeFormat::EAN13: case BarcodeFormat::ISBN: return kEan13;
    case BarcodeFormat::ITF: case BarcodeFormat::ITF14: return kItf;
    case BarcodeFormat::PDF417: case BarcodeFormat::CompactPDF417: return kPdf417;
    case BarcodeFormat::QRCode: case BarcodeFormat::QRCodeModel1: case BarcodeFormat::QRCodeModel2: return kQrCode;
    case BarcodeFormat::UPCA: return kUpcA;
    case BarcodeFormat::UPCE: return kUpcE;
    default: return -1;
  }
}

const char* ContentTypeName(ZXing::ContentType t) {
  switch (t) {
    case ZXing::ContentType::Text: return "text";
    case ZXing::ContentType::Binary: return "binary";
    case ZXing::ContentType::Mixed: return "mixed";
    case ZXing::ContentType::GS1: return "gs1";
    case ZXing::ContentType::ISO15434: return "iso15434";
    default: return "unknown";
  }
}

const char* ErrorName(const ZXing::Error& e) {
  switch (e.type()) {
    case ZXing::Error::Type::Checksum: return "checksum";
    case ZXing::Error::Type::Unsupported: return "unsupported";
    case ZXing::Error::Type::Format: return "format";
    default: return "";
  }
}

// Una versión de la imagen a leer + la transformación para volver a coordenadas de la región.
struct View {
  const char* name;
  ZXing::ImageView img;
  float ox = 0, oy = 0, scale = 1;  // x_region = ox + x / scale
};

struct Collector {
  Outcome& out;
  int regionX, regionY;

  bool Seen(const Found& f, const std::vector<Found>& list) const {
    for (const auto& g : list) {
      if (g.format != f.format) continue;
      if (!f.error.empty() || !g.error.empty()) {  // candidatos: por cercanía
        const float dx = (f.pts[0] + f.pts[4]) - (g.pts[0] + g.pts[4]);
        const float dy = (f.pts[1] + f.pts[5]) - (g.pts[1] + g.pts[5]);
        if (dx * dx + dy * dy < 400) return true;
      } else if (g.bytes == f.bytes) {
        return true;
      }
    }
    return false;
  }

  void Add(const ZXing::Barcodes& found, const View& v, const char* pass) {
    for (const auto& b : found) {
      const int fmt = MapFormat(b.format());
      if (fmt < 0) continue;
      Found f;
      f.format = fmt;
      f.error = b.isValid() ? "" : ErrorName(b.error());
      if (!b.isValid() && f.error.empty()) continue;
      const auto& p = b.position();
      for (int i = 0; i < 4; ++i) {
        f.pts[2 * i] = regionX + v.ox + p[i].x / v.scale;
        f.pts[2 * i + 1] = regionY + v.oy + p[i].y / v.scale;
      }
      if (b.isValid()) {
        f.text = b.text();
        f.bytes.assign(b.bytes().begin(), b.bytes().end());
        f.orientation = b.orientation();
        f.mirrored = b.isMirrored();
        f.inverted = b.isInverted();
        f.ecLevel = b.ecLevel();
        f.symbologyId = b.symbologyIdentifier();
        f.contentType = ContentTypeName(b.contentType());
        f.lineCount = b.lineCount();
        f.pass = pass;
        if (!Seen(f, out.results)) out.results.push_back(std::move(f));
      } else if (!Seen(f, out.candidates)) {
        out.candidates.push_back(std::move(f));
      }
    }
  }
};

int Pick(int32_t override, int fallback) { return override >= 0 ? override : fallback; }

}  // namespace

Outcome RunCascade(const uint8_t* src, int W, int H, const int32_t* o) {
  Outcome out;
  const double t0 = NowMs();
  const int strategy = std::clamp<int>(o[kStrategy], 0, 2);
  const double budget = o[kTimeBudgetMs] > 0 ? o[kTimeBudgetMs] : 1e12;

  // Región (en píxeles de la imagen de entrada).
  int rx = 0, ry = 0, rw = W, rh = H;
  if (o[kRegionW] > 0 && o[kRegionH] > 0) {
    rx = std::clamp<int>(o[kRegionX], 0, W - 1);
    ry = std::clamp<int>(o[kRegionY], 0, H - 1);
    rw = std::clamp<int>(o[kRegionW], 1, W - rx);
    rh = std::clamp<int>(o[kRegionH], 1, H - ry);
  }
  Collector col{out, rx, ry};
  const ZXing::ImageView region(src + static_cast<size_t>(ry) * W + rx, rw, rh, ZXing::ImageFormat::Lum, W);

  // Copia contigua de la región (solo si un preproceso la necesita).
  Luma regionCopy;
  auto contiguous = [&]() -> const Luma& {
    if (regionCopy.px.empty()) regionCopy = Crop(src, W, rx, ry, rw, rh);
    return regionCopy;
  };

  // Base para fast/balanced: reducida si supera maxSide (la memoria WASM no se libera).
  const int maxSide = o[kMaxSide] > 0 ? o[kMaxSide] : 2560;
  Luma reduced;
  View base{"base", region};
  if (std::max(rw, rh) > maxSide) {
    const float s = static_cast<float>(maxSide) / std::max(rw, rh);
    const Luma& c = contiguous();
    reduced = ResizeBicubic(c.px.data(), rw, rh, std::max(1, int(rw * s)), std::max(1, int(rh * s)));
    base = View{"base", ZXing::ImageView(reduced.px.data(), reduced.w, reduced.h, ZXing::ImageFormat::Lum), 0, 0, s};
  }

  ZXing::ReaderOptions common;
  common.setFormats(ZXing::BarcodeFormats(RequestedFormats(static_cast<uint32_t>(o[kFormats]))));
  common.setIsPure(o[kIsPure] == 1);
  common.setEanAddOnSymbol(static_cast<ZXing::EanAddOnSymbol>(std::clamp<int>(o[kEanAddOn], 0, 2)));
  common.setMaxNumberOfSymbols(static_cast<uint8_t>(o[kMaxSymbols] > 0 ? std::min<int>(o[kMaxSymbols], 255) : 255));
  if (o[kMinLineCount] > 0) common.setMinLineCount(static_cast<uint8_t>(std::min<int>(o[kMinLineCount], 255)));
  common.setReturnErrors(o[kReturnErrors] == 1);
  common.setValidateOptionalChecksum(o[kValidateOptional] == 1);
  if (o[kBinarizer] >= 0) common.setBinarizer(static_cast<ZXing::Binarizer>(std::clamp<int>(o[kBinarizer], 0, 3)));
  common.setTryDownscale(Pick(o[kTryDownscale], 1) == 1);
  static constexpr ZXing::TextMode kTextModes[] = {ZXing::TextMode::Plain, ZXing::TextMode::HRI, ZXing::TextMode::Escaped,
                                                   ZXing::TextMode::ECI};
  common.setTextMode(kTextModes[std::clamp<int>(o[kTextMode], 0, 3)]);

  auto optsFor = [&](bool harder) {
    ZXing::ReaderOptions r = common;
    r.setTryHarder(Pick(o[kTryHarder], harder) == 1);
    r.setTryRotate(Pick(o[kTryRotate], harder) == 1);
    r.setTryInvert(Pick(o[kTryInvert], harder) == 1);
    return r;
  };

  // Ejecuta una pasada; devuelve true si hay que parar (hay resultados o se agotó el tiempo).
  auto run = [&](const View& v, bool harder, const char* pass) {
    if (!out.passes.empty() && NowMs() - t0 > budget) {
      out.budgetExceeded = true;
      return true;
    }
    out.passes.push_back(pass);
    col.Add(ZXing::ReadBarcodes(v.img, optsFor(harder)), v, pass);
    return !out.results.empty();
  };
  auto done = [&]() { out.ms = NowMs() - t0; return out; };

  const int defaultPre = strategy == 0 ? 0 : strategy == 1 ? kPreClahe : (kPreClahe | kPreUnsharp | kPreMultiscale | kPreCrops);
  const int pre = o[kPreprocess] >= 0 ? o[kPreprocess] : defaultPre;

  if (run(base, false, "fast")) return done();
  if (strategy >= 1 && run(base, true, "harder")) return done();

  // Las pasadas con preproceso trabajan sobre la base (reducida o no) en copia contigua.
  const Luma& bl = reduced.px.empty() ? contiguous() : reduced;
  const float bs = base.scale;
  auto viewOf = [&](const char* n, const Luma& l, float ox = 0, float oy = 0, float s = 1) {
    return View{n, ZXing::ImageView(l.px.data(), l.w, l.h, ZXing::ImageFormat::Lum), ox, oy, s};
  };

  if (pre & kPreClahe) {
    const Luma c = Clahe(bl.px.data(), bl.w, bl.h);
    if (run(viewOf("clahe", c, 0, 0, bs), true, "clahe")) return done();
  }
  if (pre & kPreUnsharp) {
    const Luma u = Unsharp(bl.px.data(), bl.w, bl.h);
    if (run(viewOf("unsharp", u, 0, 0, bs), true, "unsharp")) return done();
  }
  if (pre & kPreMultiscale) {
    if (std::max(bl.w, bl.h) <= 1280) {
      const Luma up = ResizeBicubic(bl.px.data(), bl.w, bl.h, bl.w * 2, bl.h * 2);
      if (run(viewOf("x2", up, 0, 0, bs * 2), true, "x2")) return done();
    }
    if (std::min(bl.w, bl.h) >= 400) {
      const Luma dn = ResizeBicubic(bl.px.data(), bl.w, bl.h, bl.w / 2, bl.h / 2);
      if (run(viewOf("x0.5", dn, 0, 0, bs * 0.5f), true, "x0.5")) return done();
    }
  }
  if (pre & kPreCrops) {
    // Recortes solapados a resolución nativa de la región: centro 60 % y cuadrantes 60 %.
    const int cw = std::max(1, rw * 3 / 5), ch = std::max(1, rh * 3 / 5);
    const int xs[5] = {(rw - cw) / 2, 0, rw - cw, 0, rw - cw};
    const int ys[5] = {(rh - ch) / 2, 0, 0, rh - ch, rh - ch};
    for (int i = 0; i < 5; ++i) {
      const View v{"crop", region.cropped(xs[i], ys[i], cw, ch), static_cast<float>(xs[i]), static_cast<float>(ys[i]), 1};
      if (run(v, true, "crop")) return done();
    }
  }
  return done();
}

}  // namespace qhago
