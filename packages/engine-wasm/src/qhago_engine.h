// Qhago engine — declaraciones internas compartidas entre bridge, preproceso y cascada.
// SPDX-License-Identifier: MIT
#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace qhago {

// Versión del ABI C expuesto al JS. Se incrementa en cada cambio incompatible
// de exports.txt, del layout de opciones o del JSON de salida.
constexpr uint32_t kAbiVersion = 1;

// Índices del array de opciones int32 que escribe el JS (engine/options.ts).
enum Opt : int {
  kFormats = 0,         // bitmask de Format (0 = los 13)
  kStrategy,            // 0 fast, 1 balanced, 2 thorough
  kTryHarder,           // -1 = lo que diga la estrategia
  kTryRotate,           // -1
  kTryInvert,           // -1
  kTryDownscale,        // -1
  kBinarizer,           // -1 o 0 LocalAverage, 1 GlobalHistogram, 2 FixedThreshold, 3 BoolCast
  kIsPure,              // 0/1
  kEanAddOn,            // 0 ignore, 1 read, 2 require
  kMaxSymbols,          // 0 = 255
  kMinLineCount,        // 0 = default de ZXing
  kReturnErrors,        // 0/1
  kValidateOptional,    // 0/1 (validateChecksums: "strict")
  kTimeBudgetMs,        // 0 = sin límite
  kRegionX,
  kRegionY,
  kRegionW,             // 0 = imagen completa
  kRegionH,
  kPreprocess,          // -1 = lo que diga la estrategia; bitmask de Pre
  kMaxSide,             // lado máximo antes de fast/balanced (0 = 2560)
  kTextMode,            // 0 plain (default, = rawValue de BarcodeDetector), 1 hri, 2 escaped, 3 eci
  kOptCount
};

enum Pre : int { kPreClahe = 1, kPreUnsharp = 2, kPreMultiscale = 4, kPreCrops = 8 };

// Los 13 formatos de 1.0, en el mismo orden que FORMATS en el TS.
enum Format : int {
  kAztec = 0, kCodabar, kCode39, kCode93, kCode128, kDataMatrix,
  kEan8, kEan13, kItf, kPdf417, kQrCode, kUpcA, kUpcE, kFormatCount
};

extern const char* const kFormatNames[kFormatCount];

// Imagen de luminancia propia (contigua, stride = w).
struct Luma {
  int w = 0, h = 0;
  std::vector<uint8_t> px;
  Luma() = default;
  Luma(int w_, int h_) : w(w_), h(h_), px(static_cast<size_t>(w_) * h_) {}
};

// --- preprocess.cpp ---
void RgbaToLuma(const uint8_t* rgba, int w, int h, int stride, uint8_t* out);
Luma Crop(const uint8_t* src, int srcW, int x, int y, int w, int h);
Luma Clahe(const uint8_t* src, int w, int h, int tiles = 8, float clip = 2.5f);
Luma Unsharp(const uint8_t* src, int w, int h, float amount = 0.8f);
Luma ResizeBicubic(const uint8_t* src, int w, int h, int dw, int dh);

}  // namespace qhago
