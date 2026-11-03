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
    Code,
    Unknown,
    External,
}

impl NovelaidDocumentType {
    pub fn from_name(name: &str) -> Option<Self> {
        match name.trim().to_lowercase().as_str() {
            "novel" => Some(Self::Novel),
            "markdown" => Some(Self::Markdown),
            "image" => Some(Self::Image),
            "chat" => Some(Self::Chat),
            "css" => Some(Self::Css),
            "code" => Some(Self::Code),
            "gitdiff" | "git-diff" => Some(Self::GitDiff),
            "browser" => Some(Self::Browser),
            "external" => Some(Self::External),
            "unknown" => Some(Self::Unknown),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../guest-js/models.ts")]
#[serde(rename_all = "camelCase")]
pub struct NovelaidDirEntry {
    pub name: String,
    pub path: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub project_path: String,
    pub relative_parent_dir: String,
    pub parent_dir: String,
    pub base_name: String,
    pub file_title: String,
    pub extension: String,
    pub is_directory: bool,
    pub document_type: NovelaidDocumentType,
    pub children: Option<Vec<NovelaidDirEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../guest-js/models.ts")]
#[serde(rename_all = "camelCase")]
pub struct NovelaidDocument {
    pub path: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub project_path: String,
    pub relative_parent_dir: String,
    pub parent_dir: String,
    pub base_name: String,
    pub file_title: String,
    pub extension: String,
    pub content: String,
    #[ts(type = "any")]
    pub metadata: serde_json::Value,
    pub document_type: NovelaidDocumentType,
    #[ts(type = "number")]
    pub mtime_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../guest-js/models.ts")]
#[serde(rename_all = "camelCase")]
pub struct DocumentStat {
    pub path: String,
    pub exists: bool,
    #[ts(type = "number")]
    pub mtime_ms: u64,
    #[ts(type = "number")]
    pub size: u64,
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../guest-js/models.ts")]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum RemoveResult {
    Success,
    NeedConfirm {
        #[serde(rename = "fileName")]
        #[ts(rename = "fileName")]
        file_name: String,
        #[serde(rename = "isDirectory")]
        #[ts(rename = "isDirectory")]
        is_directory: bool,
    },
    NotFound,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../guest-js/models.ts")]
#[serde(rename_all = "camelCase")]
pub struct FsChangeEvent {
    pub action: String,
    pub path: String,
    pub new_path: Option<String>,
}
