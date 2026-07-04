use crate::onnx_runner::{ModelType, OnnxRunner};
use crate::types::{
    BarcodeResult, DetectionResult, ModelConfig, Point, Rect, ScanConfig, ScanEvent, Symbology,
};

pub struct RawBarcodeResult {
    pub text: String,
    pub format: String,
    pub corners: Vec<Point>,
}

pub struct ScanPipeline {
    runner: OnnxRunner,
    config: ScanConfig,
    tracking_state: TrackingState,
    models_loaded: bool,
}

#[derive(Debug, Clone)]
struct TrackingState {
    last_roi: Option<Rect>,
    last_histogram: Option<[f32; 64]>,
    last_result: Option<BarcodeResult>,
    consecutive_empty: u32,
}

impl TrackingState {
    fn new() -> Self {
        Self {
            last_roi: None,
            last_histogram: None,
            last_result: None,
            consecutive_empty: 0,
        }
    }
}

impl ScanPipeline {
    pub fn new(config: ScanConfig) -> Self {
        Self {
            runner: OnnxRunner::new(),
            config,
            tracking_state: TrackingState::new(),
            models_loaded: false,
        }
    }

    pub async fn load_models(&mut self, model_config: &ModelConfig) -> Result<(), String> {
        self.runner.load_models(model_config).await?;
        self.models_loaded = self.runner.is_model_loaded(ModelType::Detector);
        Ok(())
    }

    pub fn is_ready(&self) -> bool {
        self.models_loaded && self.runner.is_model_loaded(ModelType::Detector)
    }

    pub fn process_frame(
        &mut self,
        data: &[u8],
        width: u32,
        height: u32,
        _format: &str,
    ) -> Vec<ScanEvent> {
        let mut events = Vec::new();

        if !self.models_loaded {
            events.push(ScanEvent::Error {
                message: "Models not loaded".into(),
            });
            return events;
        }

        if self.config.enable_autofocus
            && self.runner.is_model_loaded(ModelType::Autofocus)
        {
            let input = extract_center_crop_norm(data, width, height, 128, 128);
            match self.runner.run_autofocus(&input, &[1, 3, 128, 128]) {
                Ok(score) => {
                    let focused = score >= self.config.focus_threshold;
                    events.push(ScanEvent::Focus { focused });
                    if !focused {
                        return events;
                    }
                }
                Err(e) => {
                    events.push(ScanEvent::Error { message: e });
                    return events;
                }
            }
        }

        let min_conf = self.config.min_confidence;
        let detections = detect_barcodes(
            &self.runner,
            data,
            width,
            height,
            min_conf,
        );

        let Ok(detections) = detections else {
            events.push(ScanEvent::Error {
                message: "Detection failed".into(),
            });
            return events;
        };

        if detections.is_empty() {
            self.tracking_state.consecutive_empty += 1;
            if self.tracking_state.consecutive_empty > 10 {
                self.tracking_state = TrackingState::new();
            }
            events.push(ScanEvent::Lost);
            return events;
        }

        let best = &detections[0];
        let roi = best.rect;

        let mut roi_data = crop_region(data, width, height, &roi);
        let mut roi_width = roi.width.max(1.0) as u32;
        let mut roi_height = roi.height.max(1.0) as u32;

        if self.config.enable_super_resolution
            && self.runner.is_model_loaded(ModelType::SuperResolution)
            && (roi_width < 128 || roi_height < 128)
        {
            let input = resize_and_normalize(&roi_data, roi_width, roi_height, 64, 64);
            if let Ok(upscaled) = self
                .runner
                .run_super_resolution(&input, &[1, 3, 64, 64])
            {
                roi_data = upscaled;
                roi_width = 128;
                roi_height = 128;
            }
        }

        if self.config.enable_deblur
            && self.runner.is_model_loaded(ModelType::Deblur)
            && needs_deblur_heuristic(&roi_data, roi_width, roi_height)
        {
            let input = resize_and_normalize(&roi_data, roi_width, roi_height, 128, 128);
            if let Ok(deblurred) =
                self.runner.run_deblur(&input, &[1, 3, 128, 128])
            {
                roi_data = deblurred;
            }
        }

        if self.config.enable_perspective_correction
            && self.runner.is_model_loaded(ModelType::Perspective)
        {
            let input = resize_and_normalize(&roi_data, roi_width, roi_height, 128, 128);
            if let Ok(corners) =
                self.runner.run_perspective(&input, &[1, 3, 128, 128])
            {
                if corners.len() >= 8 {
                    let out_size = 256u32;
                    let src_corners: [Point; 4] = [
                        Point {
                            x: corners[0] * roi_width as f32,
                            y: corners[1] * roi_height as f32,
                        },
                        Point {
                            x: corners[2] * roi_width as f32,
                            y: corners[3] * roi_height as f32,
                        },
                        Point {
                            x: corners[4] * roi_width as f32,
                            y: corners[5] * roi_height as f32,
                        },
                        Point {
                            x: corners[6] * roi_width as f32,
                            y: corners[7] * roi_height as f32,
                        },
                    ];

                    let matrix =
                        crate::perspective::PerspectiveCorrector::compute_warp_matrix(
                            &src_corners, out_size,
                        );
                    roi_data =
                        crate::perspective::PerspectiveCorrector::warp_perspective(
                            &roi_data,
                            roi_width,
                            roi_height,
                            &matrix,
                            out_size,
                        );
                    roi_width = out_size;
                    roi_height = out_size;
                }
            }
        }

        let gray_data = rgba_to_grayscale(&roi_data);

        let decoded = try_decode_all(&gray_data, roi_width, roi_height, &self.config.symbologies);

        match decoded {
            Some((text, format)) => {
                let result = BarcodeResult {
                    text,
                    format,
                    confidence: best.confidence,
                    corners: vec![
                        Point {
                            x: roi.x,
                            y: roi.y,
                        },
                        Point {
                            x: roi.x + roi.width,
                            y: roi.y,
                        },
                        Point {
                            x: roi.x + roi.width,
                            y: roi.y + roi.height,
                        },
                        Point {
                            x: roi.x,
                            y: roi.y + roi.height,
                        },
                    ],
                    timestamp: now_ms(),
                };

                self.tracking_state.last_roi = Some(roi);
                self.tracking_state.last_result = Some(result.clone());
                self.tracking_state.consecutive_empty = 0;

                events.push(ScanEvent::Decode { data: result });
            }
            None => {
                self.tracking_state.consecutive_empty += 1;
                events.push(ScanEvent::Lost);
            }
        }

        events
    }

    pub fn update_config(&mut self, config: ScanConfig) {
        self.config = config;
    }
}

fn extract_center_crop_norm(
    data: &[u8],
    w: u32,
    h: u32,
    crop_w: u32,
    crop_h: u32,
) -> Vec<f32> {
    let sx = (w.saturating_sub(crop_w)) / 2;
    let sy = (h.saturating_sub(crop_h)) / 2;
    let total = (crop_w * crop_h * 3) as usize;
    let mut out = vec![0.0f32; total];

    for y in 0..crop_h {
        for x in 0..crop_w {
            let si = (((sy + y) * w + (sx + x)) * 4) as usize;
            let di = ((y * crop_w + x) * 3) as usize;
            if si + 2 < data.len() && di + 2 < out.len() {
                out[di] = data[si] as f32 / 255.0;
                out[di + 1] = data[si + 1] as f32 / 255.0;
                out[di + 2] = data[si + 2] as f32 / 255.0;
            }
        }
    }
    out
}

fn resize_and_normalize(
    data: &[u8],
    src_w: u32,
    src_h: u32,
    dst_w: u32,
    dst_h: u32,
) -> Vec<f32> {
    let total = (dst_w * dst_h * 3) as usize;
    let mut out = vec![0.0f32; total];
    let scale_x = src_w as f32 / dst_w as f32;
    let scale_y = src_h as f32 / dst_h as f32;

    for y in 0..dst_h {
        for x in 0..dst_w {
            let sx = (x as f32 * scale_x) as u32;
            let sy = (y as f32 * scale_y) as u32;
            let si = ((sy * src_w + sx) * 4) as usize;
            let di = ((y * dst_w + x) * 3) as usize;
            if si + 2 < data.len() && di + 2 < out.len() {
                out[di] = data[si] as f32 / 255.0;
                out[di + 1] = data[si + 1] as f32 / 255.0;
                out[di + 2] = data[si + 2] as f32 / 255.0;
            }
        }
    }
    out
}

fn crop_region(data: &[u8], width: u32, height: u32, rect: &Rect) -> Vec<u8> {
    let x = rect.x.max(0.0) as u32;
    let y = rect.y.max(0.0) as u32;
    let w = (rect.width as u32).min(width.saturating_sub(x));
    let h = (rect.height as u32).min(height.saturating_sub(y));

    if w == 0 || h == 0 {
        return vec![0u8; 4];
    }

    let mut out = vec![0u8; (w * h * 4) as usize];
    for row in 0..h {
        for col in 0..w {
            let si = (((y + row) * width + (x + col)) * 4) as usize;
            let di = ((row * w + col) * 4) as usize;
            if si + 3 < data.len() && di + 3 < out.len() {
                out[di..di + 4].copy_from_slice(&data[si..si + 4]);
            }
        }
    }
    out
}

fn rgba_to_grayscale(data: &[u8]) -> Vec<u8> {
    let len = data.len() / 4;
    let mut out = vec![0u8; len];
    for i in 0..len {
        let idx = i * 4;
        if idx + 2 < data.len() {
            let gray = (data[idx] as u16 + data[idx + 1] as u16 + data[idx + 2] as u16) / 3;
            out[i] = gray as u8;
        }
    }
    out
}

fn needs_deblur_heuristic(data: &[u8], w: u32, h: u32) -> bool {
    if w < 3 || h < 3 {
        return false;
    }
    let gray = rgba_to_grayscale(data);
    let kernel: [i32; 9] = [0, 1, 0, 1, -4, 1, 0, 1, 0];
    let mut sum = 0.0f64;
    let mut sum_sq = 0.0f64;
    let mut count = 0u64;

    for y in 1..(h as usize - 1) {
        for x in 1..(w as usize - 1) {
            let mut lap = 0i32;
            for ky in 0..3 {
                for kx in 0..3 {
                    let idx = (y + ky - 1) * w as usize + (x + kx - 1);
                    if idx < gray.len() {
                        lap += gray[idx] as i32 * kernel[ky * 3 + kx];
                    }
                }
            }
            let v = lap as f64;
            sum += v;
            sum_sq += v * v;
            count += 1;
        }
    }
    if count == 0 {
        return false;
    }
    let mean = sum / count as f64;
    let var = (sum_sq / count as f64) - (mean * mean);
    var < 100.0
}

fn detect_barcodes(
    runner: &OnnxRunner,
    data: &[u8],
    width: u32,
    height: u32,
    min_conf: f32,
) -> Result<Vec<DetectionResult>, String> {
    let input = resize_and_normalize(data, width, height, 320, 320);

    let (boxes_raw, scores_raw, classes_raw) =
        runner.run_detector(&input, &[1, 3, 320, 320])?;

    let class_names = ["barcode_1d", "qr_code", "datamatrix", "pdf417"];
    let scale_x = width as f32 / 320.0;
    let scale_y = height as f32 / 320.0;

    let num_dets = scores_raw.len();
    let mut dets: Vec<DetectionResult> = (0..num_dets)
        .filter(|i| scores_raw[*i] >= min_conf)
        .map(|i| {
            let b = &boxes_raw[i];
            let x1 = b[0] * scale_x;
            let y1 = b[1] * scale_y;
            let x2 = b[2] * scale_x;
            let y2 = b[3] * scale_y;

            DetectionResult {
                rect: Rect {
                    x: x1,
                    y: y1,
                    width: (x2 - x1).max(0.0),
                    height: (y2 - y1).max(0.0),
                },
                confidence: scores_raw[i],
                class_id: classes_raw[i],
                class_name: class_names
                    .get(classes_raw[i] as usize)
                    .unwrap_or(&"unknown")
                    .to_string(),
            }
        })
        .collect();

    dets.sort_by(|a, b| {
        b.confidence
            .partial_cmp(&a.confidence)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(dets)
}

fn try_decode_all(
    gray: &[u8],
    width: u32,
    height: u32,
    symbologies: &[Symbology],
) -> Option<(String, String)> {
    if width < 10 || height < 10 {
        return None;
    }
    for sym in symbologies {
        if let Some(text) = zxing_decode_one(gray, width, height, sym) {
            return Some((text, sym.to_zxing_format().to_string()));
        }
    }
    None
}

fn zxing_decode_one(
    _gray: &[u8],
    _width: u32,
    _height: u32,
    _sym: &Symbology,
) -> Option<String> {
    None
}

fn now_ms() -> u64 {
    #[cfg(feature = "wasm")]
    {
        js_sys::Date::now() as u64
    }
    #[cfg(not(feature = "wasm"))]
    {
        use std::time::SystemTime;
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }
}
