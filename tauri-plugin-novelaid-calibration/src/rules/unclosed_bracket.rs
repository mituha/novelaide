use crate::models::{CalibrationIssue, CalibrationRange};
use crate::rules::brackets::{get_matching_closing_bracket, is_closing_bracket, is_matching_pair, is_opening_bracket};
use crate::rules::context::CalibrationContext;
use crate::rules::CalibrationRule;

/// 開かれた括弧の情報
struct OpenBracketInfo {
    bracket: char,
    line: u32,
    column: u32,
}

/// 対応する括弧の整合性・未閉じ検知ルール
///
/// 会話文のかぎ括弧（`「`）や丸括弧（`（`）などの開き括弧が閉じられていないケース、
/// 開き括弧がないのに閉じ括弧が存在するケース、および異なる種類の括弧で閉じられている
/// 構文エラーをスタック走査により高精度に検出します。
/// ※小説の段落（空行）を跨いだ未閉じ括弧や、同一行内で完結すべき括弧（丸括弧等）の未閉じも正確に検出します。
pub struct UnclosedBracketRule {
    pub default_enabled: bool,
}

impl Default for UnclosedBracketRule {
    fn default() -> Self {
        Self {
            default_enabled: true,
        }
    }
}

impl UnclosedBracketRule {
    /// 複数行にわたる会話文として許容される括弧（かぎ括弧・二重かぎ括弧）かどうか
    fn is_multiline_bracket(c: char) -> bool {
        c == '「' || c == '『'
    }

    /// スタックに残っている未閉じ括弧を指摘リストに追加
    fn drain_unclosed(&self, stack: &mut Vec<OpenBracketInfo>, issues: &mut Vec<CalibrationIssue>) {
        for unclosed in stack.drain(..) {
            let expected_close = get_matching_closing_bracket(unclosed.bracket);
            issues.push(CalibrationIssue {
                id: format!("unclosed-bracket-{}-{}", unclosed.line, unclosed.column),
                rule_id: self.id().to_string(),
                rule_type: self.rule_type().to_string(),
                message: format!(
                    "開き括弧「{}」が閉じられていません（対応する閉じ括弧「{}」が必要です）",
                    unclosed.bracket,
                    expected_close.unwrap_or(' ')
                ),
                range: CalibrationRange {
                    start_line: unclosed.line,
                    start_column: unclosed.column,
                    end_line: unclosed.line,
                    end_column: unclosed.column + 1,
                },
                suggestion: None,
            });
        }
    }
}

impl CalibrationRule for UnclosedBracketRule {
    fn id(&self) -> &'static str {
        "novel-unclosed-bracket"
    }

    fn name(&self) -> &'static str {
        "対応する括弧の未閉じ・不整合検知"
    }

    fn rule_type(&self) -> &'static str {
        "novel_style"
    }

    fn default_enabled(&self) -> bool {
        self.default_enabled
    }

    fn check(&self, ctx: &CalibrationContext) -> Vec<CalibrationIssue> {
        let mut issues = Vec::new();
        let mut stack: Vec<OpenBracketInfo> = Vec::new();

        for (line_idx, line) in ctx.lines.iter().enumerate() {
            let line_num = (line_idx + 1) as u32;
            let trimmed = line.trim();

            // 空行（段落境界）の場合、未閉じの括弧はそこで未閉じと確定してリセット
            if trimmed.is_empty() {
                self.drain_unclosed(&mut stack, &mut issues);
                continue;
            }

            for (col_idx, ch) in line.chars().enumerate() {
                let col_num = (col_idx + 1) as u32;

                if is_opening_bracket(ch) {
                    stack.push(OpenBracketInfo {
                        bracket: ch,
                        line: line_num,
                        column: col_num,
                    });
                } else if is_closing_bracket(ch) {
                    if let Some(top) = stack.pop() {
                        if !is_matching_pair(top.bracket, ch) {
                            let expected_close = get_matching_closing_bracket(top.bracket);
                            issues.push(CalibrationIssue {
                                id: format!("mismatched-bracket-{}-{}", line_num, col_num),
                                rule_id: self.id().to_string(),
                                rule_type: self.rule_type().to_string(),
                                message: format!(
                                    "括弧の対応が一致していません（行{}列{}の『{}』に対して『{}』が使われています）",
                                    top.line, top.column, top.bracket, ch
                                ),
                                range: CalibrationRange {
                                    start_line: line_num,
                                    start_column: col_num,
                                    end_line: line_num,
                                    end_column: col_num + 1,
                                },
                                suggestion: expected_close.map(|c| c.to_string()),
                            });
                        }
                    } else {
                        // 開き括弧がないのに閉じ括弧が現れた場合
                        issues.push(CalibrationIssue {
                            id: format!("unopened-bracket-{}-{}", line_num, col_num),
                            rule_id: self.id().to_string(),
                            rule_type: self.rule_type().to_string(),
                            message: format!("対応する開き括弧のない閉じ括弧「{}」が存在します", ch),
                            range: CalibrationRange {
                                start_line: line_num,
                                start_column: col_num,
                                end_line: line_num,
                                end_column: col_num + 1,
                            },
                            suggestion: None,
                        });
                    }
                }
            }

            // 行末時点で、複数行にまたがることが許容されない括弧（丸括弧やルビ二重山括弧等）が
            // 開いたままなら、行末で未閉じとして指摘
            let mut i = 0;
            while i < stack.len() {
                if !Self::is_multiline_bracket(stack[i].bracket) && stack[i].line == line_num {
                    let unclosed = stack.remove(i);
                    let expected_close = get_matching_closing_bracket(unclosed.bracket);
                    issues.push(CalibrationIssue {
                        id: format!("unclosed-bracket-{}-{}", unclosed.line, unclosed.column),
                        rule_id: self.id().to_string(),
                        rule_type: self.rule_type().to_string(),
                        message: format!(
                            "括弧「{}」が行末までに閉じられていません（「{}」が必要です）",
                            unclosed.bracket,
                            expected_close.unwrap_or(' ')
                        ),
                        range: CalibrationRange {
                            start_line: unclosed.line,
                            start_column: unclosed.column,
                            end_line: unclosed.line,
                            end_column: unclosed.column + 1,
                        },
                        suggestion: expected_close.map(|c| c.to_string()),
                    });
                } else {
                    i += 1;
                }
            }
        }

        // ファイル末尾に残っている未閉じ括弧
        self.drain_unclosed(&mut stack, &mut issues);

        issues
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unclosed_bracket_rule() {
        let rule = UnclosedBracketRule::default();
        let lines = vec![
            "「正常な会話文です」",
            "「複数行にわたる",
            "会話文も正常です」",
            "",
            "「閉じられていない会話文です",   // 段落未閉じ -> 指摘（行5列1）
            "",
            "開きのない閉じ括弧です」",       // 開きなし -> 指摘（行7列13）
            "",
            "『種類が違う括弧です）",         // 不一致 -> 指摘（行9列11）
            "",
            "これは（行を跨がない丸括弧です", // 単一行未閉じ -> 指摘（行11列4）
        ];
        let ctx = CalibrationContext {
            text: "",
            lines: &lines,
            tokens: &[],
        };

        let issues = rule.check(&ctx);
        assert_eq!(issues.len(), 4);

        // 1. 段落未閉じ会話（行5）
        let unclosed = issues.iter().find(|i| i.id.starts_with("unclosed-bracket-5")).unwrap();
        assert_eq!(unclosed.range.start_line, 5);

        // 2. 開きのない閉じ括弧（行7）
        let unopened = issues.iter().find(|i| i.id.starts_with("unopened-bracket-7")).unwrap();
        assert_eq!(unopened.range.start_line, 7);

        // 3. 不一致（行9）
        let mismatched = issues.iter().find(|i| i.id.starts_with("mismatched-bracket-9")).unwrap();
        assert_eq!(mismatched.range.start_line, 9);
        assert_eq!(mismatched.suggestion, Some("』".into()));

        // 4. 行内未閉じ丸括弧（行11）
        let unclosed_paren = issues.iter().find(|i| i.id.starts_with("unclosed-bracket-11")).unwrap();
        assert_eq!(unclosed_paren.range.start_line, 11);
    }
}
