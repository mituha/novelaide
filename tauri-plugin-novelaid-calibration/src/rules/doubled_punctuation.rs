use crate::models::{CalibrationIssue, CalibrationRange};
use crate::rules::context::CalibrationContext;
use crate::rules::CalibrationRule;

/// 句読点文字かどうかを判定（全角・半角の句点・読点）
fn is_punctuation(c: char) -> bool {
    matches!(c, '。' | '、' | '.' | ',')
}

/// 連続句読点検知ルール
///
/// タイポや文章編集の切り貼りによって生じた「。。」や「、、」などの
/// 句読点の連続を検出し、1文字への修正を提案します。
pub struct DoubledPunctuationRule {
    pub default_enabled: bool,
}

impl Default for DoubledPunctuationRule {
    fn default() -> Self {
        Self {
            default_enabled: true,
        }
    }
}

impl CalibrationRule for DoubledPunctuationRule {
    fn id(&self) -> &'static str {
        "novel-no-doubled-punctuation"
    }

    fn name(&self) -> &'static str {
        "連続句読点の禁止"
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
                if is_punctuation(chars[i]) {
                    let start_col = (i + 1) as u32;
                    let mut matched = String::new();

                    while i < chars.len() && is_punctuation(chars[i]) {
                        matched.push(chars[i]);
                        i += 1;
                    }

                    // 2文字以上連続している場合に指摘
                    if matched.chars().count() >= 2 {
                        let end_col = (i + 1) as u32;

                        // 推奨置換案の決定
                        let suggestion = if matched.contains('。') || matched.contains('.') {
                            Some("。".to_string())
                        } else {
                            Some("、".to_string())
                        };

                        issues.push(CalibrationIssue {
                            id: format!("doubled-punctuation-{}-{}", line_num, start_col),
                            rule_id: self.id().to_string(),
                            rule_type: self.rule_type().to_string(),
                            message: format!("句読点「{}」が重複して使われています", matched),
                            range: CalibrationRange {
                                start_line: line_num,
                                start_column: start_col,
                                end_line: line_num,
                                end_column: end_col,
                            },
                            suggestion,
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
    fn test_doubled_punctuation_rule() {
        let rule = DoubledPunctuationRule::default();
        let lines = vec![
            "それは本当です。。",                   // 句点重複 -> 指摘
            "しかし、、彼には分からなかった。",     // 読点重複 -> 指摘
            "そう、。彼が犯人だ。",                 // 混在重複 -> 指摘
            "正常な文章です。そして、問題なし。",   // 正常
        ];
        let ctx = CalibrationContext {
            text: "",
            lines: &lines,
            tokens: &[],
        };

        let issues = rule.check(&ctx);
        assert_eq!(issues.len(), 3);

        assert_eq!(issues[0].range.start_line, 1);
        assert_eq!(issues[0].suggestion, Some("。".into()));

        assert_eq!(issues[1].range.start_line, 2);
        assert_eq!(issues[1].suggestion, Some("、".into()));

        assert_eq!(issues[2].range.start_line, 3);
        assert_eq!(issues[2].suggestion, Some("。".into()));
    }
}
