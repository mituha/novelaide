use crate::models::{CalibrationIssue, CalibrationRange};
use crate::rules::context::CalibrationContext;
use crate::rules::CalibrationRule;

/// 助詞連続・重複ルール
///
/// 同一行内で同一助詞（デフォルトは「の」）が許容回数を超えて出現した場合に警告
pub struct DoubledJoshiRule {
    pub target_char: char,
    pub max_allowed: usize, // 許容回数（これを超えると指摘）
    pub default_enabled: bool,
}

impl Default for DoubledJoshiRule {
    fn default() -> Self {
        Self {
            target_char: 'の',
            max_allowed: 2, // 3回以上で指摘
            default_enabled: true,
        }
    }
}

impl DoubledJoshiRule {
    pub fn new(target_char: char, max_allowed: usize) -> Self {
        Self {
            target_char,
            max_allowed,
            default_enabled: true,
        }
    }
}

impl CalibrationRule for DoubledJoshiRule {
    fn id(&self) -> &'static str {
        "no-doubled-joshi"
    }

    fn name(&self) -> &'static str {
        "助詞の連続・多用"
    }

    fn rule_type(&self) -> &'static str {
        "particle_repetition"
    }

    fn default_enabled(&self) -> bool {
        self.default_enabled
    }

    fn check(&self, ctx: &CalibrationContext) -> Vec<CalibrationIssue> {
        let mut issues = Vec::new();

        for (line_idx, line) in ctx.lines.iter().enumerate() {
            let line_num = (line_idx + 1) as u32;
            let count = line.matches(self.target_char).count();

            if count > self.max_allowed {
                issues.push(CalibrationIssue {
                    id: format!("doubled-joshi-{}-{}", self.target_char, line_num),
                    rule_id: self.id().to_string(),
                    rule_type: self.rule_type().to_string(),
                    message: format!(
                        "同一行内で助詞「{}」が{}回使われています。修飾の連続に注意してください",
                        self.target_char, count
                    ),
                    range: CalibrationRange {
                        start_line: line_num,
                        start_column: 1,
                        end_line: line_num,
                        end_column: line.chars().count() as u32,
                    },
                    suggestion: None,
                });
            }
        }

        issues
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_doubled_joshi_rule() {
        let rule = DoubledJoshiRule::default();
        let lines = vec![
            "私の友人の犬の散歩コース。", // 3回なので指摘
            "私の友人の犬。",             // 2回なので正常
        ];
        let ctx = CalibrationContext {
            text: "私の友人の犬の散歩コース。\n私の友人の犬。",
            lines: &lines,
            tokens: &[],
        };

        let issues = rule.check(&ctx);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].range.start_line, 1);
    }
}
