use crate::onnx_runner::OnnxRunner;

pub struct AutoFocus {
    runner: OnnxRunner,
}

impl AutoFocus {
    pub fn new(runner: OnnxRunner) -> Self {
        Self { runner }
    }

    pub fn is_focused(
        &mut self,
        frame_data: &[u8],
        width: u32,
        height: u32,
        threshold: f32,
    ) -> Result<bool, String> {
        let input = extract_center_crop(frame_data, width, height, 128, 128);

        let score = self.runner.run_autofocus(
            &input,
            &[1, 3, 128, 128],
        )?;

        Ok(score >= threshold)
    }
}

fn extract_center_crop(
    data: &[u8],
    width: u32,
    height: u32,
    crop_w: u32,
    crop_h: u32,
) -> Vec<f32> {
    let start_x = (width.saturating_sub(crop_w)) / 2;
    let start_y = (height.saturating_sub(crop_h)) / 2;
    let total = (crop_w * crop_h * 3) as usize;
    let mut output = vec![0.0f32; total];

    for y in 0..crop_h {
        for x in 0..crop_w {
            let src_x = start_x + x;
            let src_y = start_y + y;
            let src_idx = ((src_y * width + src_x) * 4) as usize;
            let dst_idx = ((y * crop_w + x) * 3) as usize;

            if src_idx + 2 < data.len() && dst_idx + 2 < output.len() {
                output[dst_idx] = data[src_idx] as f32 / 255.0;
                output[dst_idx + 1] = data[src_idx + 1] as f32 / 255.0;
                output[dst_idx + 2] = data[src_idx + 2] as f32 / 255.0;
            }
        }
    }

    output
}
