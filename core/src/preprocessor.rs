use crate::onnx_runner::OnnxRunner;

const LAPLACIAN_THRESHOLD: f32 = 100.0;
const SR_THRESHOLD_PX: u32 = 128;

pub struct Preprocessor {
    runner: OnnxRunner,
}

impl Preprocessor {
    pub fn new(runner: OnnxRunner) -> Self {
        Self { runner }
    }

    pub fn needs_super_resolution(&self, width: u32, height: u32) -> bool {
        width < SR_THRESHOLD_PX || height < SR_THRESHOLD_PX
    }

    pub fn apply_super_resolution(
        &mut self,
        roi_data: &[u8],
    ) -> Result<Vec<u8>, String> {
        let input: Vec<f32> = roi_data
            .iter()
            .map(|&v| v as f32 / 255.0)
            .collect();

        let upscaled = self.runner.run_super_resolution(
            &input,
            &[1, 3, 64, 64],
        )?;

        Ok(upscaled)
    }

    pub fn needs_deblur(&self, data: &[u8], width: u32, height: u32) -> bool {
        let variance = laplacian_variance(data, width, height);
        variance < LAPLACIAN_THRESHOLD
    }

    pub fn apply_deblur(
        &mut self,
        data: &[u8],
    ) -> Result<Vec<u8>, String> {
        let input: Vec<f32> = data
            .iter()
            .map(|&v| v as f32 / 255.0)
            .collect();

        let deblurred = self.runner.run_deblur(
            &input,
            &[1, 3, 128, 128],
        )?;

        Ok(deblurred)
    }
}

fn laplacian_variance(data: &[u8], width: u32, height: u32) -> f32 {
    if width < 3 || height < 3 {
        return 0.0;
    }

    let kernel: [[i32; 3]; 3] = [
        [0, 1, 0],
        [1, -4, 1],
        [0, 1, 0],
    ];

    let mut sum = 0.0f64;
    let mut sum_sq = 0.0f64;
    let mut count = 0u64;

    for y in 1..(height - 1) {
        for x in 1..(width - 1) {
            let mut lap = 0i32;
            for ky in 0..3 {
                for kx in 0..3 {
                    let px_idx = (((y + ky as u32 - 1) * width + (x + kx as u32 - 1)) * 4) as usize;
                    if px_idx < data.len() {
                        lap += data[px_idx] as i32 * kernel[ky][kx];
                    }
                }
            }
            let val = lap as f64;
            sum += val;
            sum_sq += val * val;
            count += 1;
        }
    }

    if count == 0 {
        return 0.0;
    }

    let mean = sum / count as f64;
    let variance = (sum_sq / count as f64) - (mean * mean);
    variance as f32
}
