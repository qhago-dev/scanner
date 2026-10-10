// SPDX-License-Identifier: MIT
#pragma once

#include "qhago_engine.h"

namespace qhago {

struct Found {
  int format = -1;
  std::string text;
  std::vector<uint8_t> bytes;
  float pts[8] = {0};  // TL, TR, BR, BL en píxeles de la imagen de entrada
  int orientation = 0;
  bool mirrored = false, inverted = false;
  std::string ecLevel, symbologyId, contentType = "unknown", pass;
  int lineCount = 0;
  std::string error;  // vacío = lectura válida; "checksum" | "format" | "unsupported"
};

struct Outcome {
  std::vector<Found> results, candidates;
  std::vector<const char*> passes;
  bool budgetExceeded = false;
  double ms = 0;
};

Outcome RunCascade(const uint8_t* luma, int w, int h, const int32_t* opts);

}  // namespace qhago
