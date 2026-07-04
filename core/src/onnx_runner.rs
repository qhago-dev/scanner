use std::collections::HashMap;

use ndarray::{Array4, Ix4};
use serde::{Deserialize, Serialize};

use crate::types::ModelConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnnxTensor {
    pub name: String,
    pub shape: Vec<i64>,
    pub data: Vec<f32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ModelType {
    Detector,
    SuperResolution,
    Deblur,
    Perspective,
    Autofocus,
}

pub struct OnnxRunner {
    models: HashMap<ModelType, ModelBytes>,
}

struct ModelBytes {
    data: Vec<u8>,
    input_name: String,
    input_shape: Vec<i64>,
    output_names: Vec<String>,
}

impl OnnxRunner {
    pub fn new() -> Self {
        Self {
            models: HashMap::new(),
        }
    }

    pub async fn load_models(&mut self, config: &ModelConfig) -> Result<(), String> {
        if let Some(bytes) = &config.detector_bytes {
            self.models.insert(
                ModelType::Detector,
                ModelBytes {
                    data: bytes.clone(),
                    input_name: "input".to_string(),
                    input_shape: vec![1, 3, 320, 320],
                    output_names: vec!["boxes".into(), "scores".into(), "classes".into()],
                },
            );
        }

        if let Some(bytes) = &config.super_resolution_bytes {
            self.models.insert(
                ModelType::SuperResolution,
                ModelBytes {
                    data: bytes.clone(),
                    input_name: "input".to_string(),
                    input_shape: vec![1, 3, 64, 64],
                    output_names: vec!["output".into()],
                },
            );
        }

        if let Some(bytes) = &config.deblur_bytes {
            self.models.insert(
                ModelType::Deblur,
                ModelBytes {
                    data: bytes.clone(),
                    input_name: "input".to_string(),
                    input_shape: vec![1, 3, 128, 128],
                    output_names: vec!["output".into()],
                },
            );
        }

        if let Some(bytes) = &config.perspective_bytes {
            self.models.insert(
                ModelType::Perspective,
                ModelBytes {
                    data: bytes.clone(),
                    input_name: "input".to_string(),
                    input_shape: vec![1, 3, 128, 128],
                    output_names: vec!["corners".into()],
                },
            );
        }

        if let Some(bytes) = &config.autofocus_bytes {
            self.models.insert(
                ModelType::Autofocus,
                ModelBytes {
                    data: bytes.clone(),
                    input_name: "input".to_string(),
                    input_shape: vec![1, 3, 128, 128],
                    output_names: vec!["score".into()],
                },
            );
        }

        Ok(())
    }

    pub fn is_model_loaded(&self, model_type: ModelType) -> bool {
        self.models.contains_key(&model_type)
    }

    pub fn run_detector(
        &self,
        input: &[f32],
        shape: &[usize],
    ) -> Result<(Vec<Vec<f32>>, Vec<f32>, Vec<u32>), String> {
        let model = self
            .models
            .get(&ModelType::Detector)
            .ok_or("Detector model not loaded")?;

        let input_array = Array4::from_shape_vec(
            Ix4(shape[0], shape[1], shape[2], shape[3]),
            input.to_vec(),
        )
        .map_err(|e| format!("Shape error: {}", e))?;

        let (boxes_raw, scores_raw, classes_raw) = self.onnx_infer_detector(&model.data, &input_array)?;

        let num_boxes = scores_raw.len();
        let boxes: Vec<Vec<f32>> = (0..num_boxes).map(|i| {
            vec![
                boxes_raw[i * 4],
                boxes_raw[i * 4 + 1],
                boxes_raw[i * 4 + 2],
                boxes_raw[i * 4 + 3],
            ]
        }).collect();

        Ok((boxes, scores_raw, classes_raw))
    }

    pub fn run_super_resolution(
        &self,
        input: &[f32],
        shape: &[usize],
    ) -> Result<Vec<u8>, String> {
        let model = self
            .models
            .get(&ModelType::SuperResolution)
            .ok_or("Super-resolution model not loaded")?;

        let input_array = Array4::from_shape_vec(
            Ix4(shape[0], shape[1], shape[2], shape[3]),
            input.to_vec(),
        )
        .map_err(|e| format!("Shape error: {}", e))?;

        let output = self.onnx_infer_single(&model.data, "input", &input_array, "output")?;

        let output_data = output
            .as_slice()
            .ok_or("Cannot get slice")?
            .iter()
            .map(|&v| (v * 255.0).clamp(0.0, 255.0) as u8)
            .collect();

        Ok(output_data)
    }

    pub fn run_deblur(
        &mut self,
        input: &[f32],
        shape: &[usize],
    ) -> Result<Vec<u8>, String> {
        let model = self
            .models
            .get(&ModelType::Deblur)
            .ok_or("Deblur model not loaded")?;

        let input_array = Array4::from_shape_vec(
            Ix4(shape[0], shape[1], shape[2], shape[3]),
            input.to_vec(),
        )
        .map_err(|e| format!("Shape error: {}", e))?;

        let output = self.onnx_infer_single(&model.data, "input", &input_array, "output")?;

        let output_data = output
            .as_slice()
            .ok_or("Cannot get slice")?
            .iter()
            .map(|&v| (v * 255.0).clamp(0.0, 255.0) as u8)
            .collect();

        Ok(output_data)
    }

    pub fn run_perspective(
        &mut self,
        input: &[f32],
        shape: &[usize],
    ) -> Result<Vec<f32>, String> {
        let model = self
            .models
            .get(&ModelType::Perspective)
            .ok_or("Perspective model not loaded")?;

        let input_array = Array4::from_shape_vec(
            Ix4(shape[0], shape[1], shape[2], shape[3]),
            input.to_vec(),
        )
        .map_err(|e| format!("Shape error: {}", e))?;

        let output = self.onnx_infer_single(&model.data, "input", &input_array, "corners")?;

        let corners: Vec<f32> = output.iter().copied().collect();
        Ok(corners)
    }

    pub fn run_autofocus(
        &mut self,
        input: &[f32],
        shape: &[usize],
    ) -> Result<f32, String> {
        let model = self
            .models
            .get(&ModelType::Autofocus)
            .ok_or("Autofocus model not loaded")?;

        let input_array = Array4::from_shape_vec(
            Ix4(shape[0], shape[1], shape[2], shape[3]),
            input.to_vec(),
        )
        .map_err(|e| format!("Shape error: {}", e))?;

        let output = self.onnx_infer_single(&model.data, "input", &input_array, "score")?;
        Ok(*output.iter().next().unwrap_or(&0.0))
    }

    fn onnx_infer_detector(
        &self,
        model_bytes: &[u8],
        input: &Array4<f32>,
    ) -> Result<(Vec<f32>, Vec<f32>, Vec<u32>), String> {
        #[cfg(feature = "native")]
        {
            let session = ort::Session::builder()
                .unwrap()
                .with_execution_providers(&[
                    ort::execution_providers::CPUExecutionProvider::default().build(),
                ])
                .unwrap()
                .commit_from_memory_directly(model_bytes)
                .map_err(|e| format!("Failed to load model: {}", e))?;

            let input_tensor = ort::Tensor::from_array(input.clone())
                .map_err(|e| format!("Tensor error: {}", e))?;

            let outputs = session
                .run(ort::inputs![input_tensor].unwrap())
                .map_err(|e| format!("Inference error: {}", e))?;

            let boxes: Vec<f32> = outputs["boxes"]
                .try_extract_tensor::<f32>()
                .map_err(|e| format!("Extract boxes: {}", e))?
                .iter()
                .copied()
                .collect();

            let scores: Vec<f32> = outputs["scores"]
                .try_extract_tensor::<f32>()
                .map_err(|e| format!("Extract scores: {}", e))?
                .iter()
                .copied()
                .collect();

            let classes: Vec<u32> = outputs["classes"]
                .try_extract_tensor::<i64>()
                .map_err(|e| format!("Extract classes: {}", e))?
                .iter()
                .map(|&v| v as u32)
                .collect();

            Ok((boxes, scores, classes))
        }

        #[cfg(not(feature = "native"))]
        {
            let _ = (model_bytes, input);
            Err("ONNX Runtime native inference not available in wasm build. Use ONNX Runtime Web via JS bindings.".into())
        }
    }

    fn onnx_infer_single(
        &self,
        model_bytes: &[u8],
        input_name: &str,
        input: &Array4<f32>,
        output_name: &str,
    ) -> Result<Array4<f32>, String> {
        #[cfg(feature = "native")]
        {
            let session = ort::Session::builder()
                .unwrap()
                .with_execution_providers(&[
                    ort::execution_providers::CPUExecutionProvider::default().build(),
                ])
                .unwrap()
                .commit_from_memory_directly(model_bytes)
                .map_err(|e| format!("Failed to load model: {}", e))?;

            let input_tensor = ort::Tensor::from_array(input.clone())
                .map_err(|e| format!("Tensor error: {}", e))?;

            let outputs = session
                .run(ort::inputs![input_tensor].unwrap())
                .map_err(|e| format!("Inference error: {}", e))?;

            let data: Vec<f32> = outputs[output_name]
                .try_extract_tensor::<f32>()
                .map_err(|e| format!("Extract output: {}", e))?
                .iter()
                .copied()
                .collect();

            let shape = outputs[output_name]
                .try_extract_tensor::<f32>()
                .map_err(|e| format!("Extract shape: {}", e))?
                .shape()
                .to_vec();

            Array4::from_shape_vec(Ix4(shape[0], shape[1], shape[2], shape[3]), data)
                .map_err(|e| format!("Reshape error: {}", e))
        }

        #[cfg(not(feature = "native"))]
        {
            let _ = (model_bytes, input_name, input, output_name);
            Err("ONNX Runtime native inference not available in wasm build.".into())
        }
    }
}

impl Default for OnnxRunner {
    fn default() -> Self {
        Self::new()
    }
}
