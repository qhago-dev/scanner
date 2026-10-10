#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;

use crate::pipeline::ScanPipeline;
use crate::types::{ModelConfig, ScanConfig};

#[cfg(feature = "wasm")]
#[wasm_bindgen]
pub struct AIScanner {
    pipeline: ScanPipeline,
}

#[cfg(feature = "wasm")]
#[wasm_bindgen]
impl AIScanner {
    #[wasm_bindgen(constructor)]
    pub fn new(config_js: &JsValue) -> Result<AIScanner, String> {
        console_error_panic_hook::set_once();
        let config: ScanConfig = serde_json::from_str(
            &js_sys::JSON::stringify(config_js)
                .map_err(|_| "Failed to serialize config".to_string())?
                .as_string()
                .unwrap_or_default(),
        )
        .map_err(|e| format!("Invalid config: {}", e))?;

        Ok(AIScanner {
            pipeline: ScanPipeline::new(config),
        })
    }

    #[wasm_bindgen]
    pub async fn load_models(&mut self, model_config_js: &JsValue) -> Result<(), String> {
        let model_config: ModelConfig = serde_json::from_str(
            &js_sys::JSON::stringify(model_config_js)
                .map_err(|_| "Failed to serialize config".to_string())?
                .as_string()
                .unwrap_or_default(),
        )
        .map_err(|e| format!("Invalid model config: {}", e))?;

        self.pipeline
            .load_models(&model_config)
            .await
            .map_err(|e| format!("{}", e))
    }

    #[wasm_bindgen]
    pub fn process_frame(
        &mut self,
        data: &[u8],
        width: u32,
        height: u32,
        format: &str,
    ) -> JsValue {
        let events = self.pipeline.process_frame(data, width, height, format);
        js_sys::JSON::parse(
            &serde_json::to_string(&events).unwrap_or_default(),
        )
        .unwrap_or(JsValue::NULL)
    }

    #[wasm_bindgen]
    pub fn update_config(&mut self, config_js: &JsValue) -> Result<(), String> {
        let config: ScanConfig = serde_json::from_str(
            &js_sys::JSON::stringify(config_js)
                .map_err(|_| "Failed to serialize config".to_string())?
                .as_string()
                .unwrap_or_default(),
        )
        .map_err(|e| format!("Invalid config: {}", e))?;

        self.pipeline.update_config(config);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn is_ready(&self) -> bool {
        self.pipeline.is_ready()
    }
}
