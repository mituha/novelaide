use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../guest-js/models.ts")]
pub struct DetailedCountResult {
    /// 単純な chars().count() (ルビ記号や改行、空白すべてを含む)
    pub raw_length: usize,
    /// ルビ・記号・空白類を除外した文字数（基本文字数）
    pub char_count: usize,
    /// ルビ・記号を除外し、空白類を含めた文字数（改行含む）
    pub char_count_with_spaces: usize,
    /// 総行数
    pub line_count: usize,

    /// 空白・改行の内訳
    pub spaces: SpaceBreakdown,
    pub newlines: usize,

    /// セリフと地の文
    pub dialogue: TextSegmentMetrics,
    pub narrative: TextSegmentMetrics,

    /// 原稿用紙換算枚数 (400字詰等、小数)
    pub manuscript_sheets: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../guest-js/models.ts")]
#[serde(rename_all = "camelCase")]
pub struct SpaceBreakdown {
    pub half_width: usize,
    pub full_width: usize,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../guest-js/models.ts")]
#[serde(rename_all = "camelCase")]
pub struct TextSegmentMetrics {
    pub char_count: usize,
    pub char_count_with_spaces: usize,
    pub line_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, Default)]
#[ts(export, export_to = "../guest-js/models.ts")]
#[serde(rename_all = "camelCase")]
pub struct CountOptions {
    pub manuscript_chars_per_line: Option<usize>,
    pub manuscript_lines_per_sheet: Option<usize>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../guest-js/models.ts")]
pub struct SourcePosition {
    /// 1-based 行番号
    pub line: u32,
    /// 1-based 列番号 (char単位)
    pub column: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../guest-js/models.ts")]
pub struct RubyRange {
    /// 親文字の表層形
    pub surface: String,
    /// ルビ文字列
    pub ruby: String,
    /// 親文字の開始位置 (1-based)
    pub start: SourcePosition,
    /// 親文字の終了位置 (1-based, 終端文字の次の位置)
    pub end: SourcePosition,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../guest-js/models.ts")]
pub struct StrippedResultWithMap {
    /// ルビ・傍点記法を除去したプレーンテキスト
    pub clean_text: String,
    /// clean_text の各文字（char単位）に対応する元テキストの位置情報
    pub char_map: Vec<SourcePosition>,
    /// 元テキストに存在するルビ一覧とその親文字の正確な範囲
    pub existing_rubies: Vec<RubyRange>,
}
