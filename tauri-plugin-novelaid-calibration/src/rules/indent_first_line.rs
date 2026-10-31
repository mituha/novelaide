use crate::models::{CalibrationIssue, CalibrationRange};
use crate::rules::context::CalibrationContext;
use crate::rules::CalibrationRule;

/// 開き括弧文字かどうかを判定
pub fn is_opening_bracket(c: char) -> bool {
    matches!(
        c,
        '「' | '『' | '（' | '(' | '【' | '［' | '[' | '｛' | '{' | '〈' | '《' | '〔' | '“' | '"' | '‘' | '\''
    )
}

/// 段落冒頭の字下げ（行頭全角空白）ルール
///
/// 小説作法では、会話文（開き括弧で始まる行）以外の地の文の行頭は、
/// 原則として全角1マス空ける（字下げを行う）必要があります。
pub struct IndentFirstLineRule {
    pub default_enabled: bool,
}

impl Default for IndentFirstLineRule {
    fn default() -> Self {
        Self {
            default_enabled: true,
        }
    }
}

impl CalibrationRule for IndentFirstLineRule {
    fn id(&self) -> &'static str {
        "novel-indent-first-line"
    }

    fn name(&self) -> &'static str {
        "段落冒頭の字下げ"
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
            let trimmed = line.trim();

            // 空行は字下げ対象外
            if trimmed.is_empty() {
                continue;
            }

            // Markdown見出し行（# ）は章タイトルのため字下げ対象外
            if trimmed.starts_with('#') {
                continue;
            }

            if let Some(first_char) = line.chars().next() {
                // 会話文（開き括弧で始まる）または既に全角空白で始まっている場合は正常
                if is_opening_bracket(first_char) || first_char == '　' {
                    continue;
                }

                // 半角空白で始まっている場合は別ルール（novel-no-half-width-space）で処理されるため除外
                if first_char == ' ' || first_char == '\t' {
                    continue;
                }

                // 地の文で行頭字下げがない場合
                issues.push(CalibrationIssue {
                    id: format!("indent-first-line-{}", line_num),
                    rule_id: self.id().to_string(),
                    rule_type: self.rule_type().to_string(),
                    message: "段落の冒頭（地の文）は原則として全角1マス字下げを行います".into(),
                    range: CalibrationRange {
                        start_line: line_num,
                        start_column: 1,
                        end_line: line_num,
                        end_column: 2,
                    },
                    suggestion: Some(format!("　{}", first_char)),
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
    fn test_indent_first_line_rule() {
        let rule = IndentFirstLineRule::default();
        let lines = vec![
            "吾輩は猫である。",         // 地の文字下げなし -> 指摘
            "　吾輩は猫である。",       // 字下げあり -> 正常
            "「名前はまだ無い。」",     // 会話文（開き括弧） -> 正常
            "",                        // 空行 -> 正常
            "# 第一章 旅立ち",         // 見出し -> 正常
            "|彼女《かのじょ》の瞳。",  // ルビ付き地の文 -> 指摘
        ];
        let ctx = CalibrationContext {
            text: "吾輩は猫である。\n　吾輩は猫である。\n「名前はまだ無い。」\n\n# 第一章 旅立ち\n|彼女《かのじょ》の瞳。",
            lines: &lines,
            tokens: &[],
        };

        let issues = rule.check(&ctx);
        assert_eq!(issues.len(), 2);
        assert_eq!(issues[0].range.start_line, 1);
        assert_eq!(issues[0].suggestion, Some("　吾".into()));
        assert_eq!(issues[1].range.start_line, 6);
        assert_eq!(issues[1].suggestion, Some("　|".into()));
    }
}
