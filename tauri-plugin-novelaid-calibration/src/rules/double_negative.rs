use crate::models::{CalibrationIssue, CalibrationRange};
use crate::rules::context::CalibrationContext;
use crate::rules::CalibrationRule;

/// 二重否定パターンの定義
const DOUBLE_NEGATIVE_PATTERNS: &[&str] = &[
    "ないわけではない",
    "ないわけじゃない",
    "なくもない",
    "ないでもない",
    "なくはない",
    "ないとは言えない",
    "ないとはいえない",
    "ないとは限らない",
    "ないとはかぎらない",
];

/// 二重否定検知ルール
///
/// 「〜ないわけではない」「〜なくもない」など、意図しない二重否定による
/// 回りくどい表現を検知し、作家に確認・平易な表現への見直しを促します。
pub struct DoubleNegativeRule {
    pub default_enabled: bool,
}

impl Default for DoubleNegativeRule {
    fn default() -> Self {
        Self {
            default_enabled: true,
        }
    }
}

impl CalibrationRule for DoubleNegativeRule {
    fn id(&self) -> &'static str {
        "no-double-negative"
    }

    fn name(&self) -> &'static str {
        "二重否定検知"
    }

    fn rule_type(&self) -> &'static str {
        "grammar"
    }

    fn default_enabled(&self) -> bool {
        self.default_enabled
    }

    fn check(&self, ctx: &CalibrationContext) -> Vec<CalibrationIssue> {
        let mut issues = Vec::new();

        for (line_idx, line) in ctx.lines.iter().enumerate() {
            let line_num = (line_idx + 1) as u32;

            for &pattern in DOUBLE_NEGATIVE_PATTERNS {
                for (byte_offset, _) in line.match_indices(pattern) {
                    let start_col = line[..byte_offset].chars().count() as u32 + 1;
                    let pattern_len = pattern.chars().count() as u32;
                    let end_col = start_col + pattern_len;

                    issues.push(CalibrationIssue {
                        id: format!("double-negative-{}-{}", line_num, start_col),
                        rule_id: self.id().to_string(),
                        rule_type: self.rule_type().to_string(),
                        message: format!(
                            "二重否定表現「{}」が使われています。回りくどい表現になっていないか確認してください",
                            pattern
                        ),
                        range: CalibrationRange {
                            start_line: line_num,
                            start_column: start_col,
                            end_line: line_num,
                            end_column: end_col,
                        },
                        suggestion: None,
                    });
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
    fn test_double_negative_rule() {
        let rule = DoubleNegativeRule::default();
        let lines = vec![
            "彼の気持ちが分からないわけではない。", // ないわけではない -> 指摘
            "可能性がなくもないが、難しい。",       // なくもない -> 指摘
            "彼の気持ちがよく分かる。",             // 単純肯定 -> 正常
            "行きたくないが、仕方がない。",         // 単一否定 -> 正常
        ];
        let ctx = CalibrationContext {
            text: "彼の気持ちが分からないわけではない。\n可能性がなくもないが、難しい。\n彼の気持ちがよく分かる。\n行きたくないが、仕方がない。",
            lines: &lines,
            tokens: &[],
        };

        let issues = rule.check(&ctx);
        assert_eq!(issues.len(), 2);
        assert_eq!(issues[0].range.start_line, 1);
        assert_eq!(issues[1].range.start_line, 2);
    }
}
