use crate::models::{CalibrationIssue, CalibrationRange};
use crate::rules::context::CalibrationContext;
use crate::rules::CalibrationRule;

/// 三点リーダー偶数（2マス `……`）ルール
pub struct ThreeDotsLeaderRule {
    pub default_enabled: bool,
}

impl Default for ThreeDotsLeaderRule {
    fn default() -> Self {
        Self {
            default_enabled: true,
        }
    }
}

impl CalibrationRule for ThreeDotsLeaderRule {
    fn id(&self) -> &'static str {
        "novel-three-dots-leader"
    }

    fn name(&self) -> &'static str {
        "三点リーダー（2マス）"
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

            if line.contains('…') && !line.contains("……") {
                if let Some(col) = line.find('…') {
                    issues.push(CalibrationIssue {
                        id: format!("single-leader-{}-{}", line_num, col),
                        rule_id: self.id().to_string(),
                        rule_type: self.rule_type().to_string(),
                        message: "三点リーダーは2マス（偶数「……」）で使用するのが作法です".into(),
                        range: CalibrationRange {
                            start_line: line_num,
                            start_column: (col + 1) as u32,
                            end_line: line_num,
                            end_column: (col + 2) as u32,
                        },
                        suggestion: Some("……".into()),
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
    fn test_three_dots_leader_rule() {
        let rule = ThreeDotsLeaderRule::default();
        let lines = vec!["彼は…言った。", "彼女は……微笑んだ。"];
        let ctx = CalibrationContext {
            text: "彼は…言った。\n彼女は……微笑んだ。",
            lines: &lines,
            tokens: &[],
        };

        let issues = rule.check(&ctx);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].range.start_line, 1);
        assert_eq!(issues[0].suggestion, Some("……".into()));
    }
}
