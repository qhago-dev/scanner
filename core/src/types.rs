use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Symbology {
    Code128,
    Code39,
    Code93,
    Ean8,
    Ean13,
    UpcA,
    UpcE,
    Itf,
    Codabar,
    QrCode,
    DataMatrix,
    Pdf417,
    Aztec,
}

impl Symbology {
    pub fn all() -> Vec<Symbology> {
        vec![
            Symbology::Code128,
            Symbology::Code39,
            Symbology::Code93,
            Symbology::Ean8,
            Symbology::Ean13,
            Symbology::UpcA,
            Symbology::UpcE,
            Symbology::Itf,
            Symbology::Codabar,
            Symbology::QrCode,
            Symbology::DataMatrix,
            Symbology::Pdf417,
            Symbology::Aztec,
        ]
    }

    pub fn to_zxing_format(&self) -> &'static str {
        match self {
            Symbology::Code128 => "Code128",
            Symbology::Code39 => "Code39",
            Symbology::Code93 => "Code93",
            Symbology::Ean8 => "EAN-8",
            Symbology::Ean13 => "EAN-13",
            Symbology::UpcA => "UPC-A",
            Symbology::UpcE => "UPC-E",
            Symbology::Itf => "ITF",
            Symbology::Codabar => "Codabar",
            Symbology::QrCode => "QRCode",
            Symbology::DataMatrix => "DataMatrix",
            Symbology::Pdf417 => "PDF417",
            Symbology::Aztec => "Aztec",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    pub detector_url: Option<String>,
    pub super_resolution_url: Option<String>,
    pub deblur_url: Option<String>,
    pub perspective_url: Option<String>,
    pub autofocus_url: Option<String>,
    pub detector_bytes: Option<Vec<u8>>,
    pub super_resolution_bytes: Option<Vec<u8>>,
    pub deblur_bytes: Option<Vec<u8>>,
    pub perspective_bytes: Option<Vec<u8>>,
    pub autofocus_bytes: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanConfig {
    pub symbologies: Vec<Symbology>,
    pub enable_super_resolution: bool,
    pub enable_deblur: bool,
    pub enable_perspective_correction: bool,
    pub enable_autofocus: bool,
    pub enable_tracking: bool,
    pub tracking_sensitivity: f32,
    pub focus_threshold: f32,
    pub min_confidence: f32,
    pub scan_interval_ms: u32,
    pub max_resolution_width: u32,
}

impl Default for ScanConfig {
    fn default() -> Self {
        Self {
            symbologies: Symbology::all(),
            enable_super_resolution: true,
            enable_deblur: true,
            enable_perspective_correction: true,
            enable_autofocus: true,
            enable_tracking: true,
            tracking_sensitivity: 0.15,
            focus_threshold: 0.3,
            min_confidence: 0.5,
            scan_interval_ms: 100,
            max_resolution_width: 640,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BarcodeResult {
    pub text: String,
    pub format: String,
    pub confidence: f32,
    pub corners: Vec<Point>,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Copy)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl Rect {
    pub fn expand(&self, factor: f32) -> Rect {
        let dw = self.width * factor;
        let dh = self.height * factor;
        Rect {
            x: (self.x - dw / 2.0).max(0.0),
            y: (self.y - dh / 2.0).max(0.0),
            width: self.width + dw,
            height: self.height + dh,
        }
    }

    pub fn area(&self) -> f32 {
        self.width * self.height
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ScanEvent {
    Decode {
        data: BarcodeResult,
    },
    Tracking {
        data: BarcodeResult,
    },
    Lost,
    Focus {
        focused: bool,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, Clone)]
pub struct DetectionResult {
    pub rect: Rect,
    pub confidence: f32,
    pub class_id: u32,
    pub class_name: String,
}

#[derive(Debug, Clone)]
pub struct PipelineResult {
    pub barcode: BarcodeResult,
    pub detection: DetectionResult,
    pub processing_time_ms: f64,
}
