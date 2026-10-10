use crate::types::Symbology;

pub struct ZxingDecoder;

impl ZxingDecoder {
    pub fn new() -> Self {
        Self
    }

    pub fn decode(
        &self,
        gray_data: &[u8],
        width: u32,
        height: u32,
        symbologies: &[Symbology],
    ) -> Option<super::pipeline::RawBarcodeResult> {
        use super::pipeline::RawBarcodeResult;

        for sym in symbologies {
            if let Some(text) = decode_one(gray_data, width, height, sym) {
                return Some(RawBarcodeResult {
                    text,
                    format: sym.to_zxing_format().to_string(),
                    corners: Vec::new(),
                });
            }
        }
        None
    }
}

impl Default for ZxingDecoder {
    fn default() -> Self {
        Self::new()
    }
}

fn decode_one(
    gray_data: &[u8],
    width: u32,
    height: u32,
    sym: &Symbology,
) -> Option<String> {
    if width < 10 || height < 10 {
        return None;
    }

    let expected_size = (width as usize) * (height as usize);
    if gray_data.len() < expected_size {
        return None;
    }

    #[cfg(feature = "wasm")]
    {
        let data = &gray_data[..expected_size];
        let format_str = sym.to_zxing_format();
        let b64 = encode_base64(data);
        zxing_decode_b64(&b64, width, height, format_str)
    }

    #[cfg(not(feature = "wasm"))]
    {
        let _ = (gray_data, width, height, sym);
        None
    }
}

fn encode_base64(data: &[u8]) -> String {
    const CHARS: &[u8] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);

    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;

        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);

        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }

        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }

    result
}

#[cfg(feature = "wasm")]
#[wasm_bindgen::prelude::wasm_bindgen(raw_module = "./zxing-wrapper.js")]
extern "C" {
    fn zxing_decode_b64(data_b64: &str, width: u32, height: u32, format: &str) -> Option<String>;
}