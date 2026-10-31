use crate::models::{CalibrationIssue, CalibrationRange};
use crate::rules::context::CalibrationContext;
use crate::rules::CalibrationRule;

/// 半角感嘆符・疑問符かどうか
pub fn is_half_width_exclamation_question(c: char) -> bool {
    c == '!' || c == '?'
}

/// 半角感嘆符・疑問符を全角に変換
pub fn to_full_width_exclamation_question(c: char) -> char {
    match c {
        '!' => '！',
        '?' => '？',
        _ => c,
    }
}

/// 感嘆符・疑問符の半角混入・重なり正規化ルール
///
/// 小説本文中に半角の感嘆符・疑問符（`!`、`?`、`!?`、`?!` 等）が使われている場合、
/// 全角（`！`、`？`、`！？` 等）への修正を提案します。
pub struct ExclamationNormalizationRule {
    pub default_enabled: bool,
}

impl Default for ExclamationNormalizationRule {
    fn default() -> Self {
        Self {
            default_enabled: true,
        }
    }
}

impl CalibrationRule for ExclamationNormalizationRule {
    fn id(&self) -> &'static str {
        "novel-exclamation-normalization"
    }

    fn name(&self) -> &'static str {
        "感嘆符・疑問符の全角正規化"
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
                if is_half_width_exclamation_question(chars[i]) {
                    let start_col = (i + 1) as u32;
                    let mut normalized = String::new();

                    while i < chars.len() && is_half_width_exclamation_question(chars[i]) {
                        normalized.push(to_full_width_exclamation_question(chars[i]));
                        i += 1;
                    }
                    let end_col = (i + 1) as u32;

                    issues.push(CalibrationIssue {
                        id: format!("exclamation-normalization-{}-{}", line_num, start_col),
                        rule_id: self.id().to_string(),
                        rule_type: self.rule_type().to_string(),
                        message: "感嘆符・疑問符には全角（「！」「？」「！？」）を使用します".into(),
                        range: CalibrationRange {
                            start_line: line_num,
                            start_column: start_col,
                            end_line: line_num,
                            end_column: end_col,
                        },
                        suggestion: Some(normalized),
                    });
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
    fn test_exclamation_normalization_rule() {
        let rule = ExclamationNormalizationRule::default();
        let lines = vec![
            "本当!すごい",       // 半角 ! -> 指摘（！）
            "えっ?そうなの",     // 半角 ? -> 指摘（？）
            "まさか!?嘘だろ",    // 半角 !? -> 指摘（！？）
            "本当！？すごい",    // 全角！？ -> 正常
        ];
        let ctx = CalibrationContext {
            text: "本当!すごい\nえっ?そうなの\nまさか!?嘘だろ\n本当！？すごい",
            lines: &lines,
            tokens: &[],
        };

        let issues = rule.check(&ctx);
        assert_eq!(issues.len(), 3);
        assert_eq!(issues[0].range.start_line, 1);
        assert_eq!(issues[0].suggestion, Some("！".into()));
        assert_eq!(issues[1].range.start_line, 2);
        assert_eq!(issues[1].suggestion, Some("？".into()));
        assert_eq!(issues[2].range.start_line, 3);
        assert_eq!(issues[2].suggestion, Some("！？".into()));
    }
}
