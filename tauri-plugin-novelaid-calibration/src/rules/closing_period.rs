use crate::models::{CalibrationIssue, CalibrationRange};
use crate::rules::context::CalibrationContext;
use crate::rules::CalibrationRule;

/// 会話文末の句点ルール（`「〜〜。」` を `「〜〜」` に修正提案）
pub struct ClosingPeriodRule {
    pub default_enabled: bool,
}

impl Default for ClosingPeriodRule {
    fn default() -> Self {
        Self {
            default_enabled: true,
        }
    }
}

impl CalibrationRule for ClosingPeriodRule {
    fn id(&self) -> &'static str {
        "novel-closing-period"
    }

    fn name(&self) -> &'static str {
        "会話文末の句点"
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

            if line.contains("。」") {
                if let Some(col) = line.find("。」") {
                    issues.push(CalibrationIssue {
                        id: format!("closing-period-{}-{}", line_num, col),
                        rule_id: self.id().to_string(),
                        rule_type: self.rule_type().to_string(),
                        message: "かぎ括弧末尾の句点「。」は原則として省略します".into(),
                        range: CalibrationRange {
                            start_line: line_num,
                            start_column: (col + 1) as u32,
                            end_line: line_num,
                            end_column: (col + 3) as u32,
                        },
                        suggestion: Some("」".into()),
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
    fn test_closing_period_rule() {
        let rule = ClosingPeriodRule::default();
        let lines = vec!["「そうですか。」"];
        let ctx = CalibrationContext {
            text: "「そうですか。」",
            lines: &lines,
            tokens: &[],
        };

        let issues = rule.check(&ctx);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].suggestion, Some("」".into()));
    }
}
