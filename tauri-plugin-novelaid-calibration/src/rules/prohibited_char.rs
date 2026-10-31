use crate::models::{CalibrationIssue, CalibrationRange};
use crate::rules::context::CalibrationContext;
use crate::rules::CalibrationRule;

/// 指定した1つの文字を禁止する汎用ルール
///
/// 例: 半角空白の禁止、全角パイプの禁止など
pub struct ProhibitedCharRule {
    pub id: &'static str,
    pub name: &'static str,
    pub target_char: char,
    pub suggestion: Option<String>,
    pub message: &'static str,
    pub default_enabled: bool,
}

impl ProhibitedCharRule {
    pub fn new(
        id: &'static str,
        name: &'static str,
        target_char: char,
        suggestion: Option<String>,
        message: &'static str,
    ) -> Self {
        Self {
            id,
            name,
            target_char,
            suggestion,
            message,
            default_enabled: true,
        }
    }
}

impl CalibrationRule for ProhibitedCharRule {
    fn id(&self) -> &'static str {
        self.id
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
            for (ci, c) in line.chars().enumerate() {
                if c == self.target_char {
                    let col = (ci + 1) as u32;
                    issues.push(CalibrationIssue {
                        id: format!("{}-{}-{}", self.id, line_num, ci),
                        rule_id: self.id.to_string(),
                        rule_type: self.rule_type().to_string(),
                        message: self.message.to_string(),
                        range: CalibrationRange {
                            start_line: line_num,
                            start_column: col,
                            end_line: line_num,
                            end_column: col + 1,
                        },
                        suggestion: self.suggestion.clone(),
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
    fn test_prohibited_char_rule() {
        let rule = ProhibitedCharRule::new(
            "test-no-space",
            "半角空白禁止",
            ' ',
            Some("　".into()),
            "半角空白は禁止です",
        );

        let lines = vec!["吾輩は 猫である。"];
        let ctx = CalibrationContext {
            text: "吾輩は 猫である。",
            lines: &lines,
            tokens: &[],
        };

        let issues = rule.check(&ctx);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].range.start_column, 4);
        assert_eq!(issues[0].suggestion, Some("　".into()));
    }
}
