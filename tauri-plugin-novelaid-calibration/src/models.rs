use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../guest-js/models.ts")]
#[serde(rename_all = "camelCase")]
pub struct CalibrationRange {
    pub start_line: u32,
    pub start_column: u32,
    pub end_line: u32,
    pub end_column: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../guest-js/models.ts")]
#[serde(rename_all = "camelCase")]
pub struct CalibrationIssue {
    pub id: String,
    pub rule_id: String,
    pub rule_type: String, // "particle_repetition" | "novel_style" | "kanji_open_close" | "grammar" | "consistency"
    pub message: String,
    pub range: CalibrationRange,
    pub suggestion: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../guest-js/models.ts")]
#[serde(rename_all = "camelCase")]
pub struct TokenInfo {
    pub surface: String,
    pub pos: String,
    pub reading: Option<String>,
    pub base_form: Option<String>,
    pub range: Option<CalibrationRange>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../guest-js/models.ts")]
#[serde(rename_all = "camelCase")]
pub struct RubyCandidate {
    pub surface: String,
    pub ruby: String,
    pub range: CalibrationRange,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../guest-js/models.ts")]
#[serde(rename_all = "camelCase")]
pub struct FrequencyItem {
    pub word: String,
    pub count: u32,
    pub pos: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../guest-js/models.ts")]
#[serde(rename_all = "camelCase")]
pub struct CheckTextResult {
    pub issues: Vec<CalibrationIssue>,
    pub frequencies: Vec<FrequencyItem>,
    pub all_frequencies: Vec<FrequencyItem>,
    pub total_chars: u32,
    pub kanji_ratio: f32,
    pub hiragana_ratio: f32,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingRequest {
    pub value: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingResponse {
    pub value: Option<String>,
}
