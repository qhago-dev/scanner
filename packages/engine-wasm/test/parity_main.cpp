// Prueba de paridad (F2.2 / G2): el mismo código se compila en nativo (c++ del sistema) y en WASM (node)
// y se ejecuta sobre zxing-cpp/test/samples × 4 rotaciones × 3 estrategias. Las salidas deben coincidir.
// Uso: parity <dir-samples>   → una línea por (archivo, rotación, estrategia): "ruta|rot|estrategia|n|textos"
// SPDX-License-Identifier: MIT
#include "cascade.h"

#include <algorithm>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <string>
#include <vector>

extern "C" unsigned char* stbi_load_from_memory(const unsigned char*, int, int*, int*, int*, int);
extern "C" void stbi_image_free(void*);

namespace fs = std::filesystem;

static qhago::Luma Rotate(const qhago::Luma& s, int rot) {
  if (rot == 0) return s;
  const bool swap = rot == 90 || rot == 270;
  qhago::Luma d(swap ? s.h : s.w, swap ? s.w : s.h);
  for (int y = 0; y < s.h; ++y)
    for (int x = 0; x < s.w; ++x) {
      int nx, ny;
      if (rot == 90) { nx = s.h - 1 - y; ny = x; }
      else if (rot == 180) { nx = s.w - 1 - x; ny = s.h - 1 - y; }
      else { nx = y; ny = s.w - 1 - x; }
      d.px[static_cast<size_t>(ny) * d.w + nx] = s.px[static_cast<size_t>(y) * s.w + x];
    }
  return d;
}

int main(int argc, char** argv) {
  if (argc < 2) {
    std::cerr << "uso: parity <dir-samples>\n";
    return 2;
  }
  std::vector<fs::path> files;
  for (const auto& e : fs::recursive_directory_iterator(argv[1])) {
    const auto ext = e.path().extension().string();
    if (e.is_regular_file() && (ext == ".png" || ext == ".jpg" || ext == ".jpeg")) files.push_back(e.path());
  }
  std::sort(files.begin(), files.end());

  for (const auto& f : files) {
    std::ifstream in(f, std::ios::binary);
    const std::vector<unsigned char> buf((std::istreambuf_iterator<char>(in)), {});
    int w = 0, h = 0, c = 0;
    unsigned char* px = stbi_load_from_memory(buf.data(), static_cast<int>(buf.size()), &w, &h, &c, 1);
    if (!px) continue;
    qhago::Luma img(w, h);
    std::copy_n(px, static_cast<size_t>(w) * h, img.px.begin());
    stbi_image_free(px);

    const std::string rel = fs::relative(f, argv[1]).string();
    for (int rot : {0, 90, 180, 270}) {
      const qhago::Luma r = Rotate(img, rot);
      for (int strategy = 0; strategy < 3; ++strategy) {
        int32_t o[qhago::kOptCount] = {0};
        o[qhago::kStrategy] = strategy;
        for (int k : {qhago::kTryHarder, qhago::kTryRotate, qhago::kTryInvert, qhago::kTryDownscale, qhago::kBinarizer,
                      qhago::kPreprocess})
          o[k] = -1;
        const auto out = qhago::RunCascade(r.px.data(), r.w, r.h, o);
        std::string texts;
        for (const auto& res : out.results) {
          texts += std::string(qhago::kFormatNames[res.format]) + ":";
          for (char ch : res.text) texts += ch == '\n' ? std::string("\\n") : ch == '\r' ? std::string("\\r") : std::string(1, ch);
          texts += ";";
        }
        std::printf("%s|%d|%d|%zu|%s\n", rel.c_str(), rot, strategy, out.results.size(), texts.c_str());
      }
    }
  }
  return 0;
}
