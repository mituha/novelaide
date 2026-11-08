use crate::models::{CalibrationIssue, CalibrationRange};
use crate::rules::context::{AnalyzedToken, CalibrationContext};
use crate::rules::CalibrationRule;

/// 助詞連続・重複ルール
///
/// 同一文内（句点・感嘆符・会話括弧・改行で区切られた1文）で
/// 同一助詞（「の」「が」「を」等）が許容回数を超えて出現した場合に警告
pub struct DoubledJoshiRule {
    pub rule_id: &'static str,
    pub name: &'static str,
    pub target_char: char,
    pub max_allowed: usize, // 許容回数（これを超えると指摘）
    pub default_enabled: bool,
}

impl Default for DoubledJoshiRule {
    fn default() -> Self {
        Self {
            rule_id: "no-doubled-joshi",
            name: "助詞「の」の連続・多用",
            target_char: 'の',
            max_allowed: 2, // 3回以上で指摘
            default_enabled: true,
        }
    }
}

impl DoubledJoshiRule {
    pub fn new(rule_id: &'static str, name: &'static str, target_char: char, max_allowed: usize) -> Self {
        Self {
            rule_id,
            name,
            target_char,
            max_allowed,
            default_enabled: true,
        }
    }

    /// トークンが文の境界（デリミタ）であるかを判定
    fn is_sentence_delimiter(token: &AnalyzedToken) -> bool {
        let s = token.surface.as_str();
        if s == "。" || token.pos_sub1 == "句点" {
            return true;
        }
        if s == "！" || s == "？" || s == "!" || s == "?" || s == "！？" || s == "？！" {
            return true;
        }
        if s == "「" || s == "」" || s == "『" || s == "』" {
            return true;
        }
        false
    }

    /// 形態素解析トークンを文（Sentence）ごとにグループ化
    fn split_tokens_into_sentences<'a>(&self, tokens: &'a [AnalyzedToken]) -> Vec<SentenceGroup<'a>> {
        let mut sentences = Vec::new();
        let mut current_tokens: Vec<&'a AnalyzedToken> = Vec::new();
        let mut prev_end_line = 0u32;

        for token in tokens {
            // 改行を跨いだ場合は文の境界とみなす（段落分けや体言止め等）
            if prev_end_line > 0 && token.start_line > prev_end_line && !current_tokens.is_empty() {
                let start_line = current_tokens.first().unwrap().start_line;
                let start_column = current_tokens.first().unwrap().start_column;
                let end_line = current_tokens.last().unwrap().end_line;
                let end_column = current_tokens.last().unwrap().end_column;

                sentences.push(SentenceGroup {
                    tokens: std::mem::take(&mut current_tokens),
                    start_line,
                    start_column,
                    end_line,
                    end_column,
                });
            }
            prev_end_line = token.end_line;

            let is_delim = Self::is_sentence_delimiter(token);
            current_tokens.push(token);

            if is_delim && !current_tokens.is_empty() {
                let start_line = current_tokens.first().unwrap().start_line;
                let start_column = current_tokens.first().unwrap().start_column;
                let end_line = current_tokens.last().unwrap().end_line;
                let end_column = current_tokens.last().unwrap().end_column;

                sentences.push(SentenceGroup {
                    tokens: std::mem::take(&mut current_tokens),
                    start_line,
                    start_column,
                    end_line,
                    end_column,
                });
            }
        }

        if !current_tokens.is_empty() {
            let start_line = current_tokens.first().unwrap().start_line;
            let start_column = current_tokens.first().unwrap().start_column;
            let end_line = current_tokens.last().unwrap().end_line;
            let end_column = current_tokens.last().unwrap().end_column;

            sentences.push(SentenceGroup {
                tokens: current_tokens,
                start_line,
                start_column,
                end_line,
                end_column,
            });
        }

        sentences
    }

    /// トークン情報が存在しない場合のフォールバック（文字列・文単位分割）
    fn check_fallback(&self, ctx: &CalibrationContext) -> Vec<CalibrationIssue> {
        let mut issues = Vec::new();
        let delims = ['。', '！', '？', '!', '?', '」', '』'];

        for (line_idx, line) in ctx.lines.iter().enumerate() {
            let line_num = (line_idx + 1) as u32;
            let mut char_idx = 0;
            let mut sentence_start_col = 1u32;
            let mut sentence_count = 0usize;

            for ch in line.chars() {
                char_idx += 1;
                if ch == self.target_char {
                    sentence_count += 1;
                }

                if delims.contains(&ch) {
                    if sentence_count > self.max_allowed {
                        issues.push(CalibrationIssue {
                            id: format!("doubled-joshi-{}-{}-{}", self.target_char, line_num, sentence_start_col),
                            rule_id: self.id().to_string(),
                            rule_type: self.rule_type().to_string(),
                            message: format!(
                                "一文中で助詞「{}」が{}回使われています。修飾の連続に注意してください",
                                self.target_char, sentence_count
                            ),
                            range: CalibrationRange {
                                start_line: line_num,
                                start_column: sentence_start_col,
                                end_line: line_num,
                                end_column: char_idx as u32,
                            },
                            suggestion: None,
                        });
                    }
                    sentence_count = 0;
                    sentence_start_col = char_idx as u32 + 1;
                }
            }

            if sentence_count > self.max_allowed {
                issues.push(CalibrationIssue {
                    id: format!("doubled-joshi-{}-{}-{}", self.target_char, line_num, sentence_start_col),
                    rule_id: self.id().to_string(),
                    rule_type: self.rule_type().to_string(),
                    message: format!(
                        "一文中で助詞「{}」が{}回使われています。修飾の連続に注意してください",
                        self.target_char, sentence_count
                    ),
                    range: CalibrationRange {
                        start_line: line_num,
                        start_column: sentence_start_col,
                        end_line: line_num,
                        end_column: char_idx as u32,
                    },
                    suggestion: None,
                });
            }
        }

        issues
    }
}

struct SentenceGroup<'a> {
    tokens: Vec<&'a AnalyzedToken>,
    start_line: u32,
    start_column: u32,
    end_line: u32,
    end_column: u32,
}

impl CalibrationRule for DoubledJoshiRule {
    fn id(&self) -> &'static str {
        self.rule_id
    }

    fn name(&self) -> &'static str {
        self.name
    }

    fn rule_type(&self) -> &'static str {
        "particle_repetition"
    }

    fn default_enabled(&self) -> bool {
        self.default_enabled
    }

    fn check(&self, ctx: &CalibrationContext) -> Vec<CalibrationIssue> {
        // トークン情報が存在しない場合はフォールバック
        if ctx.tokens.is_empty() {
            return self.check_fallback(ctx);
        }

        let mut issues = Vec::new();
        let target_str = self.target_char.to_string();
        let sentences = self.split_tokens_into_sentences(ctx.tokens);

        for sentence in sentences {
            // 文内で品詞が「助詞」かつ表層形が対象助詞に一致するトークンを抽出
            let matched_tokens: Vec<&&AnalyzedToken> = sentence
                .tokens
                .iter()
                .filter(|t| t.pos_main == "助詞" && t.surface == target_str)
                .collect();

            let count = matched_tokens.len();
            if count > self.max_allowed {
                issues.push(CalibrationIssue {
                    id: format!(
                        "doubled-joshi-{}-{}-{}",
                        self.target_char, sentence.start_line, sentence.start_column
                    ),
                    rule_id: self.id().to_string(),
                    rule_type: self.rule_type().to_string(),
                    message: format!(
                        "一文中で助詞「{}」が{}回使われています。修飾の連続に注意してください",
                        self.target_char, count
                    ),
                    range: CalibrationRange {
                        start_line: sentence.start_line,
                        start_column: sentence.start_column,
                        end_line: sentence.end_line,
                        end_column: sentence.end_column,
                    },
                    suggestion: None,
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
    fn test_doubled_joshi_rule_fallback() {
        let rule = DoubledJoshiRule::default();
        let lines = vec![
            "私の友人の犬の散歩コース。", // 1文で3回なので指摘
            "私の本だ。君のペンだ。",     // 同一行だが文ごとには1回ずつなので正常
        ];
        let ctx = CalibrationContext {
            text: "私の友人の犬の散歩コース。\n私の本だ。君のペンだ。",
            lines: &lines,
            tokens: &[],
        };

        let issues = rule.check(&ctx);
        assert_eq!(issues.len(), 1, "同一行内複数文は除外され、1行目のみ指摘されること");
        assert_eq!(issues[0].range.start_line, 1);
    }

    #[test]
    fn test_doubled_joshi_with_tokens() {
        let rule = DoubledJoshiRule::default();
        let tokens = vec![
            // 文1: 私(名詞) の(助詞) 友人(名詞) の(助詞) 犬(名詞) の(助詞) 散歩(名詞) 。(記号)
            AnalyzedToken { surface: "私".into(), pos_main: "名詞".into(), pos_sub1: "代名詞".into(), reading: None, start_line: 1, start_column: 1, end_line: 1, end_column: 2 },
            AnalyzedToken { surface: "の".into(), pos_main: "助詞".into(), pos_sub1: "連体化".into(), reading: None, start_line: 1, start_column: 2, end_line: 1, end_column: 3 },
            AnalyzedToken { surface: "友人".into(), pos_main: "名詞".into(), pos_sub1: "一般".into(), reading: None, start_line: 1, start_column: 3, end_line: 1, end_column: 5 },
            AnalyzedToken { surface: "の".into(), pos_main: "助詞".into(), pos_sub1: "連体化".into(), reading: None, start_line: 1, start_column: 5, end_line: 1, end_column: 6 },
            AnalyzedToken { surface: "犬".into(), pos_main: "名詞".into(), pos_sub1: "一般".into(), reading: None, start_line: 1, start_column: 6, end_line: 1, end_column: 7 },
            AnalyzedToken { surface: "の".into(), pos_main: "助詞".into(), pos_sub1: "連体化".into(), reading: None, start_line: 1, start_column: 7, end_line: 1, end_column: 8 },
            AnalyzedToken { surface: "散歩".into(), pos_main: "名詞".into(), pos_sub1: "サ変接続".into(), reading: None, start_line: 1, start_column: 8, end_line: 1, end_column: 10 },
            AnalyzedToken { surface: "。".into(), pos_main: "記号".into(), pos_sub1: "句点".into(), reading: None, start_line: 1, start_column: 10, end_line: 1, end_column: 11 },
            // 文2 (同一行): きのこ(名詞) の(助詞) 味(名詞) 。(記号)
            AnalyzedToken { surface: "きのこ".into(), pos_main: "名詞".into(), pos_sub1: "一般".into(), reading: None, start_line: 1, start_column: 11, end_line: 1, end_column: 14 },
            AnalyzedToken { surface: "の".into(), pos_main: "助詞".into(), pos_sub1: "連体化".into(), reading: None, start_line: 1, start_column: 14, end_line: 1, end_column: 15 },
            AnalyzedToken { surface: "味".into(), pos_main: "名詞".into(), pos_sub1: "一般".into(), reading: None, start_line: 1, start_column: 15, end_line: 1, end_column: 16 },
            AnalyzedToken { surface: "。".into(), pos_main: "記号".into(), pos_sub1: "句点".into(), reading: None, start_line: 1, start_column: 16, end_line: 1, end_column: 17 },
        ];
        let lines = vec!["私の友人の犬の散歩。きのこと味。"];
        let ctx = CalibrationContext {
            text: "私の友人の犬の散歩。きのこと味。",
            lines: &lines,
            tokens: &tokens,
        };

        let issues = rule.check(&ctx);
        // 文1のみ助詞「の」が3回で指摘され、文2は「きのこ」に含まれる「の」が除外され助詞「の」は1回のみなので指摘なし
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].range.start_line, 1);
        assert_eq!(issues[0].range.start_column, 1);
        assert_eq!(issues[0].range.end_column, 11);
    }
}
