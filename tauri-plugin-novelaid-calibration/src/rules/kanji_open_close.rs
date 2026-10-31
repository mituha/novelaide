use crate::models::{CalibrationIssue, CalibrationRange};
use crate::rules::context::CalibrationContext;
use crate::rules::CalibrationRule;

/// 形式名詞・常用漢字の開きルール
///
/// 「事」「時」「物」「所」などが非自立・形式名詞として使用された場合にひらがな（こと、とき、もの、ところ）への開きを推奨
pub struct KanjiOpenCloseRule {
    pub default_enabled: bool,
}

impl Default for KanjiOpenCloseRule {
    fn default() -> Self {
        Self {
            default_enabled: true,
        }
    }
}

impl CalibrationRule for KanjiOpenCloseRule {
    fn id(&self) -> &'static str {
        "kanji-open-close"
    }

    fn name(&self) -> &'static str {
        "漢字の開き（形式名詞）"
    }

    fn rule_type(&self) -> &'static str {
        "kanji_open_close"
    }

    fn default_enabled(&self) -> bool {
        self.default_enabled
    }

    fn check(&self, ctx: &CalibrationContext) -> Vec<CalibrationIssue> {
        let mut issues = Vec::new();

        for token in ctx.tokens {
            if token.pos_main == "名詞" && (token.pos_sub1 == "非自立" || token.pos_sub1 == "形式名詞") {
                let (open_word, msg) = match token.surface.as_str() {
                    "事" => ("こと", "形式名詞「事」は平仮名「こと」で開くことが推奨されます"),
                    "時" => ("とき", "形式名詞「時」は平仮名「とき」で開くことが推奨されます"),
                    "物" => ("もの", "形式名詞「物」は平仮名「もの」で開くことが推奨されます"),
                    "所" => ("ところ", "形式名詞「所」は平仮名「ところ」で開くことが推奨されます"),
                    _ => ("", ""),
                };

                if !open_word.is_empty() {
                    issues.push(CalibrationIssue {
                        id: format!("kanji-open-{}-{}", token.start_line, token.start_column),
                        rule_id: self.id().to_string(),
                        rule_type: self.rule_type().to_string(),
                        message: msg.into(),
                        range: CalibrationRange {
                            start_line: token.start_line,
                            start_column: token.start_column,
                            end_line: token.end_line,
                            end_column: token.end_column,
                        },
                        suggestion: Some(open_word.into()),
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
    use crate::rules::context::AnalyzedToken;

    #[test]
    fn test_kanji_open_close_rule() {
        let rule = KanjiOpenCloseRule::default();
        let tokens = vec![
            AnalyzedToken {
                surface: "事".into(),
                pos_main: "名詞".into(),
                pos_sub1: "非自立".into(),
                reading: Some("コト".into()),
                start_line: 1,
                start_column: 5,
                end_line: 1,
                end_column: 6,
            },
            AnalyzedToken {
                surface: "事件".into(),
                pos_main: "名詞".into(),
                pos_sub1: "一般".into(),
                reading: Some("ジケン".into()),
                start_line: 1,
                start_column: 10,
                end_line: 1,
                end_column: 12,
            },
        ];
        let lines = vec!["テスト"];
        let ctx = CalibrationContext {
            text: "テスト",
            lines: &lines,
            tokens: &tokens,
        };

        let issues = rule.check(&ctx);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].suggestion, Some("こと".into()));
    }
}
