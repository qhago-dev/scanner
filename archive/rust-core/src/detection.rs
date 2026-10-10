use crate::onnx_runner::OnnxRunner;
use crate::types::{DetectionResult, Rect};

const NMS_IOU_THRESHOLD: f32 = 0.45;
const INPUT_SIZE: u32 = 320;

const CLASS_NAMES: &[&str] = &[
    "barcode_1d",
    "qr_code",
    "datamatrix",
    "pdf417",
];

pub struct Detector {
    runner: OnnxRunner,
}

impl Detector {
    pub fn new(runner: OnnxRunner) -> Self {
        Self { runner }
    }

    pub fn detect(
        &mut self,
        image_data: &[u8],
        width: u32,
        height: u32,
        min_confidence: f32,
    ) -> Result<Vec<DetectionResult>, String> {
        let preprocessed = preprocess_image(image_data, width, height, INPUT_SIZE);

        let (boxes, scores, classes) = self.runner.run_detector(
            &preprocessed,
            &[1, 3, INPUT_SIZE as usize, INPUT_SIZE as usize],
        )?;

        let detections: Vec<DetectionResult> = boxes
            .iter()
            .enumerate()
            .filter(|(i, _)| scores[*i] >= min_confidence)
            .map(|(i, b)| DetectionResult {
                rect: Rect {
                    x: b[0] * width as f32 / INPUT_SIZE as f32,
                    y: b[1] * height as f32 / INPUT_SIZE as f32,
                    width: (b[2] - b[0]) * width as f32 / INPUT_SIZE as f32,
                    height: (b[3] - b[1]) * height as f32 / INPUT_SIZE as f32,
                },
                confidence: scores[i],
                class_id: classes[i],
                class_name: CLASS_NAMES
                    .get(classes[i] as usize)
                    .unwrap_or(&"unknown")
                    .to_string(),
            })
            .collect();

        let detections = apply_nms(detections, NMS_IOU_THRESHOLD);

        Ok(detections)
    }
}

fn preprocess_image(data: &[u8], width: u32, height: u32, target_size: u32) -> Vec<f32> {
    let total = (target_size * target_size * 3) as usize;
    let mut output = vec![0.0f32; total];

    if data.len() < (width * height * 4) as usize {
        return output;
    }

    let scale_x = width as f32 / target_size as f32;
    let scale_y = height as f32 / target_size as f32;

    for y in 0..target_size {
        for x in 0..target_size {
            let src_x = (x as f32 * scale_x) as u32;
            let src_y = (y as f32 * scale_y) as u32;
            let src_idx = ((src_y * width + src_x) * 4) as usize;

            if src_idx + 2 < data.len() {
                let idx = ((y * target_size + x) * 3) as usize;
                output[idx] = data[src_idx] as f32 / 255.0;
                output[idx + 1] = data[src_idx + 1] as f32 / 255.0;
                output[idx + 2] = data[src_idx + 2] as f32 / 255.0;
            }
        }
    }

    output
}

fn iou(a: &Rect, b: &Rect) -> f32 {
    let x1 = a.x.max(b.x);
    let y1 = a.y.max(b.y);
    let x2 = (a.x + a.width).min(b.x + b.width);
    let y2 = (a.y + a.height).min(b.y + b.height);

    let intersection = (x2 - x1).max(0.0) * (y2 - y1).max(0.0);
    let union = a.area() + b.area() - intersection;

    if union <= 0.0 {
        0.0
    } else {
        intersection / union
    }
}

fn apply_nms(mut detections: Vec<DetectionResult>, threshold: f32) -> Vec<DetectionResult> {
    detections.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal));

    let mut keep = vec![true; detections.len()];

    for i in 0..detections.len() {
        if !keep[i] {
            continue;
        }
        for j in (i + 1)..detections.len() {
            if !keep[j] {
                continue;
            }
            if detections[i].class_id == detections[j].class_id
                && iou(&detections[i].rect, &detections[j].rect) > threshold
            {
                keep[j] = false;
            }
        }
    }

    detections
        .into_iter()
        .enumerate()
        .filter(|(i, _)| keep[*i])
        .map(|(_, d)| d)
        .collect()
}
