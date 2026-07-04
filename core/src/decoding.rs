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

fn decode_one(_gray: &[u8], _width: u32, _height: u32, _sym: &Symbology) -> Option<String> {
    None
}
