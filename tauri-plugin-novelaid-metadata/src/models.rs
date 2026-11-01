use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// エンティティの分類カテゴリ
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntityCategory {
    Character,
    Location,
    Term,
    Item,
    Other,
}

impl Default for EntityCategory {
    fn default() -> Self {
        EntityCategory::Other
    }
}

/// 登場人物・世界設定エンティティ
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEntity {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reading: Option<String>,
    #[serde(default)]
    pub aliases: Vec<String>,
    pub category: EntityCategory,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_path: Option<String>,
    #[serde(default)]
    pub occurrence_count: usize,
}

/// ルビ出現詳細
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RubyOccurrence {
    pub ruby: String,
    pub count: usize,
    pub first_seen_path: String,
}

/// 作品固有ルビ辞書エントリ
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRubyEntry {
    pub surface: String,
    pub canonical_ruby: String,
    pub variants: Vec<RubyOccurrence>,
    pub has_conflict: bool,
}

/// 校正エンジンに渡すプロジェクト知識コンテキスト
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalibrationProjectContext {
    pub entities: Vec<ProjectEntity>,
    pub ruby_dictionary: Vec<ProjectRubyEntry>,
}

/// プロジェクト走査サマリー
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectScanSummary {
    pub project_path: String,
    pub total_files_scanned: usize,
    pub total_entities: usize,
    pub total_ruby_entries: usize,
    pub duration_ms: u64,
}

/// 本文とメタデータの分離結果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentContentWithMetadata {
    pub metadata: serde_json::Value,
    pub content: String,
}

/// メタデータキャッシュの型エイリアス
pub type MetadataCache = HashMap<String, serde_json::Value>;
