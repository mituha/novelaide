use crate::models::{CalibrationIssue, CalibrationRange};
use crate::rules::context::CalibrationContext;
use crate::rules::CalibrationRule;

/// 感嘆符・疑問符かどうかを判定
pub fn is_exclamation_question(c: char) -> bool {
    matches!(c, '！' | '？' | '!' | '?')
}

/// 空白文字（全角・半角・タブ）かどうかを判定
pub fn is_space(c: char) -> bool {
    c == '　' || c == ' ' || c == '\t'
}

/// 閉じ括弧文字かどうかを判定
pub fn is_closing_bracket(c: char) -> bool {
    matches!(
        c,
        '」' | '』' | '）' | ')' | '】' | '］' | ']' | '｝' | '}' | '〉' | '》' | '〕' | '”' | '"' | '’' | '\''
    )
}

/// 感嘆符・疑問符の直後の空白チェックルール
pub struct ExclamationSpaceRule {
    pub default_enabled: bool,
}

impl Default for ExclamationSpaceRule {
    fn default() -> Self {
        Self {
            default_enabled: true,
        }
    }
}

impl CalibrationRule for ExclamationSpaceRule {
    fn id(&self) -> &'static str {
        "novel-exclamation-space"
    }

    fn name(&self) -> &'static str {
        "感嘆符・疑問符後の空白"
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

            for (ci, &c) in chars.iter().enumerate() {
                if is_exclamation_question(c) && ci + 1 < chars.len() {
                    let next = chars[ci + 1];
                    // 空白、閉じ括弧、または別の感嘆符・疑問符が続く場合は正常（空白要求不要）
                    if !is_space(next) && !is_closing_bracket(next) && !is_exclamation_question(next) {
                        let col = (ci + 1) as u32;
                        issues.push(CalibrationIssue {
                            id: format!("exclamation-space-{}-{}", line_num, ci),
                            rule_id: self.id().to_string(),
                            rule_type: self.rule_type().to_string(),
                            message: "感嘆符・疑問符の直後に文章が続く場合は全角空白を空けるのが通例です".into(),
                            range: CalibrationRange {
                                start_line: line_num,
                                start_column: col,
                                end_line: line_num,
                                end_column: col + 1,
                            },
                            suggestion: Some(format!("{}　", c)),
                        });
                    }
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
    fn test_exclamation_space_rule() {
        let rule = ExclamationSpaceRule::default();
        let lines = vec![
            "「本当？」",             // 閉じ括弧なので正常
            "本当！すごいね",           // 直後に文字が続くので指摘
            "本当！？そうなんだ",       // 連続記号の末尾直後に文字なので指摘
        ];
        let ctx = CalibrationContext {
            text: "「本当？」\n本当！すごいね\n本当！？そうなんだ",
            lines: &lines,
            tokens: &[],
        };

        let issues = rule.check(&ctx);
        assert_eq!(issues.len(), 2);
        assert_eq!(issues[0].range.start_line, 2);
        assert_eq!(issues[0].suggestion, Some("！　".into()));
        assert_eq!(issues[1].range.start_line, 3);
        assert_eq!(issues[1].suggestion, Some("？　".into()));
    }
}
