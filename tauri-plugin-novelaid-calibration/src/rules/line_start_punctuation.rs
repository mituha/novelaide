use crate::models::{CalibrationIssue, CalibrationRange};
use crate::rules::brackets::is_closing_bracket;
use crate::rules::context::CalibrationContext;
use crate::rules::CalibrationRule;

/// 行頭禁則文字かどうかを判定（句読点、閉じ括弧、音引き、中黒など）
fn is_line_start_prohibited(c: char) -> bool {
    matches!(c, '、' | '。' | ',' | '.' | 'ー' | '・') || is_closing_bracket(c)
}

/// 行頭禁則記号の検知ルール
///
/// 日本語組版および小説作法において、行の先頭に配置することが禁じられている
/// 句読点（`、` `。`）や閉じ括弧（`」` `）` 等）、音引きなどの記号が行頭に
/// 置かれているケースを検出します。
pub struct LineStartPunctuationRule {
    pub default_enabled: bool,
}

impl Default for LineStartPunctuationRule {
    fn default() -> Self {
        Self {
            default_enabled: true,
        }
    }
}

impl CalibrationRule for LineStartPunctuationRule {
    fn id(&self) -> &'static str {
        "novel-no-line-start-punctuation"
    }

    fn name(&self) -> &'static str {
        "行頭禁則記号の検知"
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

            if trimmed.is_empty() || trimmed.starts_with('#') {
                continue;
            }

            // 行頭の空白（全角・半角・タブ）をスキップした最初の文字とその列位置を取得
            let chars: Vec<char> = line.chars().collect();
            for (col_idx, &ch) in chars.iter().enumerate() {
                if ch == '　' || ch == ' ' || ch == '\t' {
                    continue;
                }

                // 最初の非空白文字が行頭禁則文字か検証
                if is_line_start_prohibited(ch) {
                    let col_num = (col_idx + 1) as u32;
                    issues.push(CalibrationIssue {
                        id: format!("line-start-punct-{}-{}", line_num, col_num),
                        rule_id: self.id().to_string(),
                        rule_type: self.rule_type().to_string(),
                        message: format!(
                            "行頭禁則文字「{}」が行の先頭に置かれています。前行への結合または配置の調整を検討してください",
                            ch
                        ),
                        range: CalibrationRange {
                            start_line: line_num,
                            start_column: col_num,
                            end_line: line_num,
                            end_column: col_num + 1,
                        },
                        suggestion: None,
                    });
                }

                // 最初の文字をチェックしたらその行は終了
                break;
            }
        }

        issues
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_line_start_punctuation_rule() {
        let rule = LineStartPunctuationRule::default();
        let lines = vec![
            "、しかし彼は歩き続けた。",         // 行頭読点 -> 指摘
            "。そして朝が来た。",               // 行頭句点 -> 指摘
            "　」と彼女は言った。",             // 字下げ後の行頭閉じ括弧 -> 指摘
            "）心の声の末尾。",                 // 行頭丸閉じ括弧 -> 指摘
            "「正常な会話文です」",             // 開き括弧 -> 正常
            "　正常な地の文です。",             // 地の文 -> 正常
            "# 見出し行のテスト",               // 見出し -> 正常
            "",                                 // 空行 -> 正常
        ];
        let ctx = CalibrationContext {
            text: "",
            lines: &lines,
            tokens: &[],
        };

        let issues = rule.check(&ctx);
        assert_eq!(issues.len(), 4);

        assert_eq!(issues[0].range.start_line, 1);
        assert_eq!(issues[0].range.start_column, 1);

        assert_eq!(issues[1].range.start_line, 2);
        assert_eq!(issues[1].range.start_column, 1);

        assert_eq!(issues[2].range.start_line, 3);
        assert_eq!(issues[2].range.start_column, 2); // 全角空白の次

        assert_eq!(issues[3].range.start_line, 4);
        assert_eq!(issues[3].range.start_column, 1);
    }
}
