use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(TS, Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[ts(export, export_to = "../guest-js/models.ts")]
#[serde(rename_all = "camelCase")]
pub enum NovelaidDocumentType {
    Novel,
    Markdown,
    Image,
    Chat,
    GitDiff,
    Browser,
    Css,
    Unknown,
    External,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../guest-js/models.ts")]
#[serde(rename_all = "camelCase")]
pub struct NovelaidDirEntry {
    pub name: String,
    pub path: String,
    pub base_name: String,
    pub file_title: String,
    pub is_directory: bool,
    pub document_type: NovelaidDocumentType,
    pub children: Option<Vec<NovelaidDirEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../guest-js/models.ts")]
#[serde(rename_all = "camelCase")]
pub struct NovelaidDocument {
    pub path: String,
    pub base_name: String,
    pub file_title: String,
    pub content: String,
    #[ts(type = "any")]
    pub metadata: serde_json::Value,
    pub document_type: NovelaidDocumentType,
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
