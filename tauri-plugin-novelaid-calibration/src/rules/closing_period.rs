use crate::models::{CalibrationIssue, CalibrationRange};
use crate::rules::brackets::is_closing_bracket;
use crate::rules::context::CalibrationContext;
use crate::rules::CalibrationRule;

/// 会話文末などの括弧直前の句点ルール（`「〜〜。」` を `「〜〜」` に修正提案）
///
/// かぎ括弧（`」`）だけでなく、二重かぎ括弧（`』`）や丸括弧（`）`）など、
/// すべての閉じ括弧の直前にある不要な句点「。」を網羅的に検出・修正提案します。
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
            let chars: Vec<char> = line.chars().collect();

            if chars.len() < 2 {
                continue;
            }

            for i in 0..(chars.len() - 1) {
                // 句点「。」の直後に閉じ括弧が続く場合
                if chars[i] == '。' && is_closing_bracket(chars[i + 1]) {
                    let closing_char = chars[i + 1];
                    let start_col = (i + 1) as u32;
                    let end_col = (i + 3) as u32; // 「。」と閉じ括弧の2文字

                    issues.push(CalibrationIssue {
                        id: format!("closing-period-{}-{}", line_num, start_col),
                        rule_id: self.id().to_string(),
                        rule_type: self.rule_type().to_string(),
                        message: format!(
                            "閉じ括弧「{}」直前の句点「。」は原則として省略します",
                            closing_char
                        ),
                        range: CalibrationRange {
                            start_line: line_num,
                            start_column: start_col,
                            end_line: line_num,
                            end_column: end_col,
                        },
                        suggestion: Some(closing_char.to_string()),
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
        let lines = vec![
            "「これはテストです。」",               // かぎ括弧直前の句点 -> 指摘
            "『こちらもテストです。』",             // 二重かぎ括弧直前の句点 -> 指摘
            "（心の声もテストです。）",             // 丸括弧直前の句点 -> 指摘
            "「正常な会話文です」と彼は言った。",   // 正常
            "「一つ目。」と「二つ目。」の2箇所。", // 1行に複数箇所 -> 2件検出
        ];
        let ctx = CalibrationContext {
            text: "",
            lines: &lines,
            tokens: &[],
        };

        let issues = rule.check(&ctx);
        assert_eq!(issues.len(), 5);
        assert_eq!(issues[0].range.start_line, 1);
        assert_eq!(issues[0].suggestion, Some("」".into()));

        assert_eq!(issues[1].range.start_line, 2);
        assert_eq!(issues[1].suggestion, Some("』".into()));

        assert_eq!(issues[2].range.start_line, 3);
        assert_eq!(issues[2].suggestion, Some("）".into()));

        // 1行複数箇所の検証
        assert_eq!(issues[3].range.start_line, 5);
        assert_eq!(issues[4].range.start_line, 5);
    }
}
