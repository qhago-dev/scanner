use std::collections::HashMap;

use crate::types::ModelConfig;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ModelType {
    Detector,
    SuperResolution,
    Deblur,
    Perspective,
    Autofocus,
}

pub struct OnnxRunner {
    session_ids: HashMap<ModelType, u32>,
}

#[cfg(feature = "wasm")]
mod bridge {
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen(raw_module = "./onnx-bridge.js")]
    extern "C" {
        pub async fn onnx_load(b64_model: &str) -> u32;
        pub async fn onnx_run(
            session_id: u32,
            b64_input: &str,
            shape_json: &str,
        ) -> Option<String>;
        pub fn onnx_free(session_id: u32);
    }
}

fn encode_base64(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b = [chunk[0] as u32, *chunk.get(1).unwrap_or(&0) as u32, *chunk.get(2).unwrap_or(&0) as u32];
        let t = (b[0] << 16) | (b[1] << 8) | b[2];
        out.push(CHARS[(t >> 18) as usize & 63] as char);
        out.push(CHARS[(t >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { CHARS[(t >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { CHARS[t as usize & 63] as char } else { '=' });
    }
    out
}

fn floats_to_b64(data: &[f32]) -> String {
    let bytes = unsafe { std::slice::from_raw_parts(data.as_ptr() as *const u8, data.len() * 4) };
    encode_base64(bytes)
}

impl OnnxRunner {
    pub fn new() -> Self {
        Self { session_ids: HashMap::new() }
    }

    pub async fn load_models(&mut self, config: &ModelConfig) -> Result<(), String> {
        #[cfg(feature = "wasm")]
        {
            let models: Vec<(ModelType, &Option<Vec<u8>>)> = vec![
                (ModelType::Detector, &config.detector_bytes),
                (ModelType::SuperResolution, &config.super_resolution_bytes),
                (ModelType::Deblur, &config.deblur_bytes),
                (ModelType::Perspective, &config.perspective_bytes),
                (ModelType::Autofocus, &config.autofocus_bytes),
            ];

            for (mt, bytes_opt) in &models {
                if let Some(bytes) = bytes_opt {
                    let b64 = encode_base64(bytes);
                    let sid = bridge::onnx_load(&b64).await;
                    if sid > 0 {
                        self.session_ids.insert(*mt, sid);
                    }
                }
            }
            Ok(())
        }
        #[cfg(not(feature = "wasm"))]
        {
            let _ = config;
            Err("ONNX only in WASM".into())
        }
    }

    pub fn is_model_loaded(&self, model_type: ModelType) -> bool {
        self.session_ids.contains_key(&model_type)
    }

    pub async fn run_inference(
        &self,
        model_type: ModelType,
        input: &[f32],
        shape: &[usize],
    ) -> Result<Vec<f32>, String> {
        #[cfg(feature = "wasm")]
        {
            let sid = self.session_ids.get(&model_type).copied()
                .ok_or("Model not loaded")?;
            let shape_json = format!(
                "[{}]", shape.iter().map(|s| s.to_string()).collect::<Vec<_>>().join(",")
            );
            let input_b64 = floats_to_b64(input);
            let output_b64 = bridge::onnx_run(sid, &input_b64, &shape_json).await
                .ok_or("Inference returned null")?;

            let bytes = {
                let mut v = Vec::with_capacity(output_b64.len() * 3 / 4);
                let chars: Vec<u8> = output_b64.bytes().collect();
                let mut i = 0;
                while i + 3 < chars.len() {
                    let decode = |c: u8| -> u8 {
                        match c {
                            b'A'..=b'Z' => c - b'A',
                            b'a'..=b'z' => c - b'a' + 26,
                            b'0'..=b'9' => c - b'0' + 52,
                            b'+' => 62,
                            b'/' => 63,
                            _ => 0,
                        }
                    };
                    if chars[i+1] == b'=' || chars[i+2] == b'=' { break; }
                    let b0 = decode(chars[i]) as u32;
                    let b1 = decode(chars[i+1]) as u32;
                    let b2 = decode(chars[i+2]) as u32;
                    let b3 = decode(chars[i+3]) as u32;
                    v.push(((b0 << 2) | (b1 >> 4)) as u8);
                    if chars[i+2] != b'=' { v.push(((b1 << 4) | (b2 >> 2)) as u8); }
                    if chars[i+3] != b'=' { v.push(((b2 << 6) | b3) as u8); }
                    i += 4;
                }
                v
            };

            let mut floats = Vec::with_capacity(bytes.len() / 4);
            for chunk in bytes.chunks_exact(4) {
                floats.push(f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]));
            }
            Ok(floats)
        }
        #[cfg(not(feature = "wasm"))]
        {
            let _ = (model_type, input, shape);
            Err("ONNX only in WASM".into())
        }
    }

    pub fn run_detector(&self, _input: &[f32], _shape: &[usize]) -> Result<(Vec<Vec<f32>>, Vec<f32>, Vec<u32>), String> {
        Err("Use run_inference(Detector, ...) instead".into())
    }

    pub fn run_super_resolution(&self, _input: &[f32], _shape: &[usize]) -> Result<Vec<u8>, String> {
        Err("Use run_inference(SuperResolution, ...) instead".into())
    }

    pub fn run_deblur(&self, _input: &[f32], _shape: &[usize]) -> Result<Vec<u8>, String> {
        Err("Use run_inference(Deblur, ...) instead".into())
    }

    pub fn run_perspective(&self, _input: &[f32], _shape: &[usize]) -> Result<Vec<f32>, String> {
        Err("Use run_inference(Perspective, ...) instead".into())
    }

    pub fn run_autofocus(&self, _input: &[f32], _shape: &[usize]) -> Result<f32, String> {
        Err("Use run_inference(Autofocus, ...) instead".into())
    }
}

impl Default for OnnxRunner {
    fn default() -> Self { Self::new() }
}
