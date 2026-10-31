/// 形態素解析済みのトークン情報（行・列番号解決済み）
#[derive(Debug, Clone)]
pub struct AnalyzedToken {
    pub surface: String,
    pub pos_main: String,
    pub pos_sub1: String,
    pub reading: Option<String>,
    pub start_line: u32,
    pub start_column: u32,
    pub end_line: u32,
    pub end_column: u32,
}

/// 校正ルールに渡されるコンテキスト情報
pub struct CalibrationContext<'a> {
    pub text: &'a str,
    pub lines: &'a [&'a str],
    pub tokens: &'a [AnalyzedToken],
}
