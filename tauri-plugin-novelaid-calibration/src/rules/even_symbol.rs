use crate::models::{CalibrationIssue, CalibrationRange};
use crate::rules::context::CalibrationContext;
use crate::rules::CalibrationRule;

/// 2マス（偶数単位）などの倍数で使用すべき記号の校正ルール
///
/// 三点リーダー（`……`）やダッシュ（`――`）など、小説作法において
/// 2マス（偶数個）単位で用いることが推奨される記号を共通アルゴリズムで検証します。
pub struct EvenSymbolRule {
    rule_id: &'static str,
    name: &'static str,
    symbol_name: &'static str,
    canonical_char: char,
    matcher: fn(char) -> bool,
    unit_size: usize,
    pub default_enabled: bool,
}

impl EvenSymbolRule {
    pub fn new(
        rule_id: &'static str,
        name: &'static str,
        symbol_name: &'static str,
        canonical_char: char,
        matcher: fn(char) -> bool,
        unit_size: usize,
    ) -> Self {
        Self {
            rule_id,
            name,
            symbol_name,
            canonical_char,
            matcher,
            unit_size,
            default_enabled: true,
        }
    }

    /// 三点リーダー用のデフォルトインスタンス生成
    pub fn three_dots_leader() -> Self {
        Self::new(
            "novel-three-dots-leader",
            "三点リーダー（2マス）",
            "三点リーダー",
            '…',
            |c| c == '…',
            2,
        )
    }

    /// ダッシュ用のデフォルトインスタンス生成（全角ダッシュ U+2015, EMダッシュ U+2014, 罫線 U+2500）
    pub fn dash_leader() -> Self {
        Self::new(
            "novel-dash-leader",
            "ダッシュ（2マス）",
            "ダッシュ",
            '―',
            |c| matches!(c, '―' | '—' | '─'),
            2,
        )
    }
}

impl CalibrationRule for EvenSymbolRule {
    fn id(&self) -> &'static str {
        self.rule_id
    }

    fn name(&self) -> &'static str {
        self.name
    }

    fn rule_type(&self) -> &'static str {
        "novel_style"
    }

    fn default_enabled(&self) -> bool {
        self.default_enabled
    }

    fn check(&self, ctx: &CalibrationContext) -> Vec<CalibrationIssue> {
        let mut issues = Vec::new();

        for (line_idx, line) in ctx.lines.iter().enumerate() {
            let line_num = (line_idx + 1) as u32;
            let chars: Vec<char> = line.chars().collect();
            let mut i = 0;

            while i < chars.len() {
                if (self.matcher)(chars[i]) {
                    let start_col = (i + 1) as u32;
                    let mut count = 0;
                    while i < chars.len() && (self.matcher)(chars[i]) {
                        count += 1;
                        i += 1;
                    }
                    let end_col = (i + 1) as u32;

                    // 1マス単独、または unit_size（通常2）の倍数でない場合に指摘
                    if count == 1 {
                        let suggested = self.canonical_char.to_string().repeat(self.unit_size);
                        issues.push(CalibrationIssue {
                            id: format!("single-{}-{}-{}", self.rule_id, line_num, start_col),
                            rule_id: self.id().to_string(),
                            rule_type: self.rule_type().to_string(),
                            message: format!(
                                "{}は{}マス（偶数「{}」）で使用するのが作法です",
                                self.symbol_name, self.unit_size, suggested
                            ),
                            range: CalibrationRange {
                                start_line: line_num,
                                start_column: start_col,
                                end_line: line_num,
                                end_column: end_col,
                            },
                            suggestion: Some(suggested),
                        });
                    } else if count % self.unit_size != 0 {
                        // 3マスなどの奇数の場合は偶数マス（次の倍数）への修正提案
                        let target_count = ((count + self.unit_size - 1) / self.unit_size) * self.unit_size;
                        let suggested = self.canonical_char.to_string().repeat(target_count);

                        issues.push(CalibrationIssue {
                            id: format!("odd-{}-{}-{}", self.rule_id, line_num, start_col),
                            rule_id: self.id().to_string(),
                            rule_type: self.rule_type().to_string(),
                            message: format!(
                                "{}が奇数（{}マス）使われています。{}マスの倍数で使用するのが作法です",
                                self.symbol_name, count, self.unit_size
                            ),
                            range: CalibrationRange {
                                start_line: line_num,
                                start_column: start_col,
                                end_line: line_num,
                                end_column: end_col,
                            },
                            suggestion: Some(suggested),
                        });
                    }
                } else {
                    i += 1;
                }
            }
        }

        issues
    }
}
