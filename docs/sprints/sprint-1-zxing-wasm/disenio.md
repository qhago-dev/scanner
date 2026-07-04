# Sprint 1 — Diseño técnico: ZXing-C++ en WASM

## Arquitectura

```
┌──────────────────────────────────────────────────────┐
│  Rust (core/src/decoding.rs)                         │
│                                                      │
│  fn decode_one(gray, w, h, symbology) -> Option<String> │
│     │                                                │
│     │  llama a                                       │
│     ▼                                                │
│  ┌──────────────────────────────────────┐            │
│  │  extern "C" {                        │            │
│  │    fn zxing_read_barcode(            │            │
│  │      data: *const u8,                │            │
│  │      width: i32,                     │            │
│  │      height: i32,                    │            │
│  │      format: *const u8,              │            │
│  │      result_buffer: *mut u8,         │            │
│  │      result_max_len: i32,            │            │
│  │    ) -> i32;  // -1 = error, N = bytes escritos │  │
│  │  }                                   │            │
│  └──────────────────────────────────────┘            │
│     ▲                                                │
│     │  importa                                       │
│     │                                                │
│  ┌──────────────────────────────────────┐            │
│  │  zxing_barcode.wasm                  │            │
│  │  (compilado con Emscripten desde     │            │
│  │   zxing-cpp/lib, Apache 2.0)         │            │
│  └──────────────────────────────────────┘            │
└──────────────────────────────────────────────────────┘
```

## Decisiones de diseño

### Opción A: Compilar ZXing-C++ a WASM con Emscripten y llamarlo desde Rust vía `extern "C"` → `wasm-bindgen`

**Ventaja**: ZXing-C++ completo, probado, todos los formatos
**Desventaja**: Dos módulos WASM separados (core + zxing), necesita glue JS de Emscripten
**Riesgo**: El glue de Emscripten puede interferir con el runtime de wasm-bindgen

### Opción B: Compilar ZXing-C++ a un solo .wasm linkeado estáticamente con el core Rust

**Ventaja**: Un solo archivo .wasm, sin glue JS extra
**Desventaja**: Requiere compilar C++ con `wasm32-unknown-unknown` (no Emscripten), ZXing-C++ usa C++17 con STL que no compila limpiamente sin emscripten
**Riesgo**: Alto — ZXing-C++ depende de STL (std::string, std::vector) que no está disponible en wasm32-unknown-unknown sin libc de emscripten

### → Decisión: Opción A (Emscripten, dos módulos WASM)

El core Rust (.wasm de wasm-bindgen) y zxing (.wasm de Emscripten) se cargan como módulos separados. La comunicación es vía shared `WebAssembly.Memory` + punteros.

## Flujo de llamada

```
1. JS carga scanai_core_bg.wasm (166 KB)
2. JS carga zxing_barcode.wasm (~500 KB, compilado con -Os)
3. JS inicializa el módulo Emscripten (llama a _initialize si es necesario)
4. JS pasa punteros de funciones de zxing al core Rust como imports
5. Rust llama a zxing_read_barcode() pasando el buffer de la imagen
6. ZXing escribe el resultado en un buffer compartido
7. Rust lee el buffer y lo convierte a String
```

## API C propuesta para ZXing WASM

```c
// zxing_bridge.c — wrapper C mínimo sobre ZXing-C++

#include "ReadBarcode.h"  // ZXing-C++ API

// Retorna: longitud del texto decodificado, 0 si no se encontró, -1 si error
int zxing_read_barcode(
    const uint8_t* data,      // buffer grayscale
    int width,                 // ancho en píxeles
    int height,                // alto en píxeles
    const char* format,        // "Code128", "QRCode", etc.
    char* result_buffer,       // buffer de salida (pre-asignado)
    int result_max_len         // tamaño máximo del buffer
) {
    try {
        auto image = ZXing::ImageView(data, width, height, ZXing::ImageFormat::Lum);
        auto hints = ZXing::DecodeHints().setFormats(
            ZXing::BarcodeFormatFromString(format)
        );
        auto result = ZXing::ReadBarcode(image, hints);
        
        if (result.isValid()) {
            std::string text = result.text();
            int len = std::min((int)text.size(), result_max_len - 1);
            memcpy(result_buffer, text.c_str(), len);
            result_buffer[len] = '\0';
            return len;
        }
        return 0;
    } catch (...) {
        return -1;
    }
}
```

## Compilación con Emscripten

```bash
# En zxing-cpp/
mkdir build-wasm && cd build-wasm

emcmake cmake .. \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DZXING_BUILD_EXAMPLES=OFF \
  -DZXING_BUILD_BENCHMARKS=OFF \
  -DZXING_BUILD_UNIT_TESTS=OFF \
  -DZXING_USE_BUNDLED_FS=OFF

emmake make -j$(nproc)

# El resultado es libZXing.a que linkeamos con nuestro bridge
emcc -O3 -s WASM=1 \
  -s EXPORTED_FUNCTIONS='["_zxing_read_barcode","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s TOTAL_MEMORY=16MB \
  zxing_bridge.c libZXing.a \
  -o zxing_barcode.js
```

## Integración en Rust

```rust
// core/src/decoding.rs

#[wasm_bindgen(module = "/zxing_barcode.js")]
extern "C" {
    fn zxing_read_barcode(
        data: *const u8,
        width: i32,
        height: i32,
        format: *const u8,
        result_buf: *mut u8,
        result_max: i32,
    ) -> i32;
}

fn decode_one(gray: &[u8], width: u32, height: u32, sym: &Symbology) -> Option<String> {
    let format_str = sym.to_zxing_format();
    let format_cstr = std::ffi::CString::new(format_str).ok()?;
    
    let mut result_buf = vec![0u8; 4096];
    
    let len = unsafe {
        zxing_read_barcode(
            gray.as_ptr(),
            width as i32,
            height as i32,
            format_cstr.as_ptr(),
            result_buf.as_mut_ptr(),
            4096,
        )
    };
    
    if len > 0 {
        let text = std::str::from_utf8(&result_buf[..len as usize]).ok()?;
        Some(text.to_string())
    } else {
        None
    }
}
```
