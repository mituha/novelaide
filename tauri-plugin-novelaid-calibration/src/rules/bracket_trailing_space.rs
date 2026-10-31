use crate::models::{CalibrationIssue, CalibrationRange};
use crate::rules::context::CalibrationContext;
use crate::rules::exclamation_space::{is_closing_bracket, is_space};
use crate::rules::CalibrationRule;

/// 括弧直前の不要な空白除去ルール
///
/// 会話文などの閉じ括弧直前に空白（`「〜〜　」` や `「〜〜 」`）が混入している場合、
/// 不要な空白を除去した閉じ括弧への修正を提案します。
pub struct BracketTrailingSpaceRule {
    pub default_enabled: bool,
}

impl Default for BracketTrailingSpaceRule {
    fn default() -> Self {
        Self {
            default_enabled: true,
        }
    }
}

impl CalibrationRule for BracketTrailingSpaceRule {
    fn id(&self) -> &'static str {
        "novel-no-bracket-trailing-space"
    }

    fn name(&self) -> &'static str {
        "括弧末尾の不要な空白除去"
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
                // 空白が検出され、その後に閉じ括弧が続くか検証
                if is_space(chars[i]) {
                    let space_start = i;
                    while i < chars.len() && is_space(chars[i]) {
                        i += 1;
                    }

                    if i < chars.len() && is_closing_bracket(chars[i]) {
                        let closing_char = chars[i];
                        let start_col = (space_start + 1) as u32;
                        let end_col = (i + 2) as u32; // 空白群 + 閉じ括弧を含めた範囲

                        issues.push(CalibrationIssue {
                            id: format!("bracket-trailing-space-{}-{}", line_num, space_start),
                            rule_id: self.id().to_string(),
                            rule_type: self.rule_type().to_string(),
                            message: "閉じ括弧直前の空白は原則として不要です".into(),
                            range: CalibrationRange {
                                start_line: line_num,
                                start_column: start_col,
                                end_line: line_num,
                                end_column: end_col,
                            },
                            suggestion: Some(closing_char.to_string()),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bracket_trailing_space_rule() {
        let rule = BracketTrailingSpaceRule::default();
        let lines = vec![
            "「そうだね　」",     // 全角空白直後に閉じ括弧 -> 指摘
            "「そうだね 」",      // 半角空白直後に閉じ括弧 -> 指摘
            "「そうだね　　」",   // 連続空白直後に閉じ括弧 -> 指摘
            "「そうだね」",       // 空白なし -> 正常
            "「本当？　そうだよ」", // 文中の空白 -> 正常
        ];
        let ctx = CalibrationContext {
            text: "「そうだね　」\n「そうだね 」\n「そうだね　　」\n「そうだね」\n「本当？　そうだよ」",
            lines: &lines,
            tokens: &[],
        };

        let issues = rule.check(&ctx);
        assert_eq!(issues.len(), 3);
        assert_eq!(issues[0].range.start_line, 1);
        assert_eq!(issues[0].suggestion, Some("」".into()));
        assert_eq!(issues[1].range.start_line, 2);
        assert_eq!(issues[1].suggestion, Some("」".into()));
        assert_eq!(issues[2].range.start_line, 3);
        assert_eq!(issues[2].suggestion, Some("」".into()));
    }
}
