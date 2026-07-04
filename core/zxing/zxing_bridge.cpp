/**
 * zxing_bridge.cpp — Minimal C bridge over ZXing-C++ for WASM compilation.
 *
 * Exposes a single C function callable from JavaScript/WASM:
 *   zxing_read_barcode(data, width, height, format, result_buf, result_max_len) -> int
 *
 * License: Apache 2.0 (derived from ZXing-C++, same license as upstream)
 */

#include <cstring>
#include <string>

#include "ReadBarcode.h"
#include "ImageView.h"
#include "BarcodeFormat.h"
#include "ReaderOptions.h"

extern "C" {

/**
 * Decodes a barcode from raw grayscale image data.
 *
 * @param data           Pointer to grayscale image buffer (one byte per pixel, row-major)
 * @param width          Image width in pixels
 * @param height         Image height in pixels
 * @param format_str     Barcode format string ("Code128", "QRCode", "EAN-13", etc.)
 *                       Pass nullptr or "" to try all formats.
 * @param result_buffer  Pre-allocated output buffer for the decoded text
 * @param result_max_len Maximum bytes available in result_buffer (including null terminator)
 *
 * @return Number of bytes written to result_buffer (excluding null terminator),
 *         0 if no barcode was found,
 *        -1 on internal error.
 */
int zxing_read_barcode(
    const uint8_t* data,
    int width,
    int height,
    const char* format_str,
    char* result_buffer,
    int result_max_len
) {
    if (!data || width <= 0 || height <= 0 || !result_buffer || result_max_len <= 1) {
        return -1;
    }

    try {
        auto image = ZXing::ImageView(data, width, height, ZXing::ImageFormat::Lum);

        auto hints = ZXing::ReaderOptions();

        if (format_str && format_str[0] != '\0') {
            auto fmt = ZXing::BarcodeFormatFromString(format_str);
            if (fmt != ZXing::BarcodeFormat::None) {
                hints.setFormats({fmt});
            }
        }

        auto result = ZXing::ReadBarcode(image, hints);

        if (result.isValid()) {
            std::string text = result.text();
            int copy_len = std::min(static_cast<int>(text.size()), result_max_len - 1);
            std::memcpy(result_buffer, text.c_str(), copy_len);
            result_buffer[copy_len] = '\0';
            return copy_len;
        }

        return 0;
    } catch (...) {
        return -1;
    }
}

/**
 * Version string for compatibility checking.
 */
const char* zxing_version(void) {
    return "ZXing-C++ 2.3.0 (WASM bridge v1)";
}

} // extern "C"
