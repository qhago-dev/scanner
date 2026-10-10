use crate::types::{BarcodeResult, Rect, ScanConfig};

const HISTOGRAM_BINS: usize = 64;
const MAX_EMPTY_FRAMES: u32 = 10;
const ROI_EXPAND_FACTOR: f32 = 0.20;

pub struct Tracker {
    state: TrackerState,
    config: ScanConfig,
}

#[derive(Debug, Clone)]
struct TrackerState {
    last_roi: Option<Rect>,
    last_histogram: Option<Vec<f32>>,
    last_result: Option<BarcodeResult>,
    consecutive_empty: u32,
    frame_count: u64,
}

impl Tracker {
    pub fn new(config: &ScanConfig) -> Self {
        Self {
            state: TrackerState {
                last_roi: None,
                last_histogram: None,
                last_result: None,
                consecutive_empty: 0,
                frame_count: 0,
            },
            config: config.clone(),
        }
    }

    pub fn should_skip_pipeline(
        &mut self,
        current_roi: Option<Rect>,
        frame_data: &[u8],
        frame_width: u32,
        frame_height: u32,
    ) -> bool {
        self.state.frame_count += 1;

        if !self.config.enable_tracking {
            return false;
        }

        let roi = match current_roi {
            Some(r) => r.expand(ROI_EXPAND_FACTOR),
            None => {
                self.state.consecutive_empty += 1;
                if self.state.consecutive_empty > MAX_EMPTY_FRAMES {
                    self.state.last_roi = None;
                    self.state.last_histogram = None;
                }
                return false;
            }
        };

        if self.state.last_roi.is_some() {
            let current_hist = compute_roi_histogram(
                frame_data,
                frame_width,
                frame_height,
                &roi,
            );

            if let Some(ref last_hist) = self.state.last_histogram {
                let dist = histogram_distance(&current_hist, last_hist);

                if dist < self.config.tracking_sensitivity
                    && self.state.consecutive_empty < MAX_EMPTY_FRAMES
                {
                    return true;
                }
            }

            self.state.last_histogram = Some(current_hist);
        } else {
            self.state.last_histogram = Some(compute_roi_histogram(
                frame_data,
                frame_width,
                frame_height,
                &roi,
            ));
        }

        self.state.last_roi = Some(roi);
        self.state.last_roi = None;
        false
    }

    pub fn update_with_result(
        &mut self,
        result: &BarcodeResult,
        roi: Rect,
        frame_data: &[u8],
        frame_width: u32,
        frame_height: u32,
    ) {
        self.state.last_result = Some(result.clone());
        self.state.last_roi = Some(roi.expand(ROI_EXPAND_FACTOR));
        self.state.last_histogram = Some(compute_roi_histogram(
            frame_data,
            frame_width,
            frame_height,
            &roi,
        ));
        self.state.consecutive_empty = 0;
    }

    pub fn is_tracking_same(&self, new_result: &BarcodeResult) -> bool {
        self.state
            .last_result
            .as_ref()
            .map(|r| r.text == new_result.text)
            .unwrap_or(false)
    }

    pub fn reset(&mut self) {
        self.state = TrackerState {
            last_roi: None,
            last_histogram: None,
            last_result: None,
            consecutive_empty: 0,
            frame_count: 0,
        };
    }
}

fn compute_roi_histogram(
    data: &[u8],
    width: u32,
    height: u32,
    roi: &Rect,
) -> Vec<f32> {
    let mut hist = vec![0u32; HISTOGRAM_BINS];

    let x_start = roi.x.max(0.0) as u32;
    let y_start = roi.y.max(0.0) as u32;
    let x_end = (roi.x + roi.width).min(width as f32) as u32;
    let y_end = (roi.y + roi.height).min(height as f32) as u32;

    let mut count = 0u32;

    for y in y_start..y_end {
        for x in x_start..x_end {
            let idx = ((y * width + x) * 4) as usize;
            if idx + 2 < data.len() {
                let gray = (data[idx] as u32 + data[idx + 1] as u32 + data[idx + 2] as u32) / 3;
                let bin = (gray * (HISTOGRAM_BINS as u32 - 1) / 256) as usize;
                if bin < HISTOGRAM_BINS {
                    hist[bin] += 1;
                    count += 1;
                }
            }
        }
    }

    if count == 0 {
        return vec![0.0; HISTOGRAM_BINS];
    }

    hist.iter()
        .map(|&v| v as f32 / count as f32)
        .collect()
}

fn histogram_distance(a: &[f32], b: &[f32]) -> f32 {
    let mut dist = 0.0f32;
    for i in 0..HISTOGRAM_BINS {
        let diff = a[i] - b[i];
        dist += diff * diff;
    }
    dist.sqrt()
}
