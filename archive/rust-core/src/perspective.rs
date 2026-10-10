use crate::onnx_runner::OnnxRunner;
use crate::types::Point;

const OUTPUT_SIZE: u32 = 256;

pub struct PerspectiveCorrector {
    runner: OnnxRunner,
}

impl PerspectiveCorrector {
    pub fn new(runner: OnnxRunner) -> Self {
        Self { runner }
    }

    pub fn detect_corners(
        &mut self,
        roi_data: &[u8],
    ) -> Result<[Point; 4], String> {
        let input: Vec<f32> = roi_data
            .iter()
            .map(|&v| v as f32 / 255.0)
            .collect();

        let corners = self.runner.run_perspective(
            &input,
            &[1, 3, 128, 128],
        )?;

        if corners.len() < 8 {
            return Err("Invalid corners output".into());
        }

        Ok([
            Point { x: corners[0], y: corners[1] },
            Point { x: corners[2], y: corners[3] },
            Point { x: corners[4], y: corners[5] },
            Point { x: corners[6], y: corners[7] },
        ])
    }

    pub fn compute_warp_matrix(
        src_corners: &[Point; 4],
        dst_size: u32,
    ) -> [[f32; 3]; 3] {
        let dst_corners: [Point; 4] = [
            Point { x: 0.0, y: 0.0 },
            Point { x: dst_size as f32, y: 0.0 },
            Point { x: dst_size as f32, y: dst_size as f32 },
            Point { x: 0.0, y: dst_size as f32 },
        ];

        solve_homography(src_corners, &dst_corners)
    }

    pub fn warp_perspective(
        data: &[u8],
        src_width: u32,
        src_height: u32,
        matrix: &[[f32; 3]; 3],
        dst_size: u32,
    ) -> Vec<u8> {
        let mut output = vec![0u8; (dst_size * dst_size * 4) as usize];

        for y in 0..dst_size {
            for x in 0..dst_size {
                let wx = x as f32;
                let wy = y as f32;

                let denom = matrix[2][0] * wx + matrix[2][1] * wy + matrix[2][2];
                if denom.abs() < 1e-6 {
                    continue;
                }

                let src_x = (matrix[0][0] * wx + matrix[0][1] * wy + matrix[0][2]) / denom;
                let src_y = (matrix[1][0] * wx + matrix[1][1] * wy + matrix[1][2]) / denom;

                if src_x >= 0.0 && src_x < src_width as f32 - 1.0
                    && src_y >= 0.0 && src_y < src_height as f32 - 1.0
                {
                    let sx = src_x as u32;
                    let sy = src_y as u32;
                    let src_idx = ((sy * src_width + sx) * 4) as usize;
                    let dst_idx = ((y * dst_size + x) * 4) as usize;

                    if src_idx + 3 < data.len() {
                        output[dst_idx] = data[src_idx];
                        output[dst_idx + 1] = data[src_idx + 1];
                        output[dst_idx + 2] = data[src_idx + 2];
                        output[dst_idx + 3] = 255;
                    }
                }
            }
        }

        output
    }
}

fn solve_homography(src: &[Point; 4], dst: &[Point; 4]) -> [[f32; 3]; 3] {
    let mut a = [[0.0f32; 9]; 8];
    for i in 0..4 {
        let sx = src[i].x;
        let sy = src[i].y;
        let dx = dst[i].x;
        let dy = dst[i].y;

        a[i * 2] = [sx, sy, 1.0, 0.0, 0.0, 0.0, -dx * sx, -dx * sy, -dx];
        a[i * 2 + 1] = [0.0, 0.0, 0.0, sx, sy, 1.0, -dy * sx, -dy * sy, -dy];
    }

    let h = solve_linear_system_8x8(a);
    let norm = if h[8].abs() > 1e-6 { h[8] } else { 1.0 };

    [
        [h[0] / norm, h[1] / norm, h[2] / norm],
        [h[3] / norm, h[4] / norm, h[5] / norm],
        [h[6] / norm, h[7] / norm, 1.0],
    ]
}

fn solve_linear_system_8x8(mut a: [[f32; 9]; 8]) -> [f32; 9] {
    for col in 0..8 {
        let mut max_row = col;
        let mut max_val = a[col][col].abs();
        for row in (col + 1)..8 {
            if a[row][col].abs() > max_val {
                max_val = a[row][col].abs();
                max_row = row;
            }
        }
        a.swap(col, max_row);

        let pivot = a[col][col];
        if pivot.abs() < 1e-10 {
            continue;
        }

        for j in col..9 {
            a[col][j] /= pivot;
        }

        for row in 0..8 {
            if row != col {
                let factor = a[row][col];
                for j in col..9 {
                    a[row][j] -= factor * a[col][j];
                }
            }
        }
    }

    let mut result = [0.0f32; 9];
    for i in 0..8 {
        result[i] = a[i][8];
    }
    result[8] = 1.0;

    result
}
