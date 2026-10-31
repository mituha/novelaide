use crate::models::{CalibrationIssue, CalibrationRange};
use crate::rules::context::CalibrationContext;
use crate::rules::CalibrationRule;

/// 文末の終止形カテゴリ
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum SentenceEndKind {
    /// 過去・完了助動詞「た」「だ」
    Ta,
    /// 丁寧語「です」「でした」
    Desu,
    /// 丁寧語「ます」「ました」
    Masu,
    /// 体言止め、動詞終止形、その他
    Other,
}

impl SentenceEndKind {
    pub fn label(&self) -> &'static str {
        match self {
            SentenceEndKind::Ta => "〜た／〜だ",
            SentenceEndKind::Desu => "〜です／〜でした",
            SentenceEndKind::Masu => "〜ます／〜ました",
            SentenceEndKind::Other => "その他",
        }
    }
}

/// 抽出された文の情報
struct SentenceInfo {
    kind: SentenceEndKind,
    line: u32,
    end_col: u32,
}

/// 文末助動詞の連続重複検知ルール
///
/// 「〜た。〜た。〜た。」のように、同一の助動詞文末が3連続以上続くと
/// 小説の文章リズムが単調になりやすいため、作家に注意喚起を促します。
/// ※会話文（「……」）や空行、見出し行は地の文のリズムを妨げないよう適切に処理します。
pub struct SentenceEndRepetitionRule {
    pub default_enabled: bool,
    pub max_allowed: usize,
}

impl Default for SentenceEndRepetitionRule {
    fn default() -> Self {
        Self {
            default_enabled: true,
            max_allowed: 2, // 3連続以上で指摘
        }
    }
}

impl SentenceEndRepetitionRule {
    pub fn new(max_allowed: usize) -> Self {
        Self {
            default_enabled: true,
            max_allowed,
        }
    }

    /// 行内の文を抽出し、文末カテゴリと位置情報を取得
    fn extract_sentences_from_line(&self, line: &str, line_num: u32) -> Vec<SentenceInfo> {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            return Vec::new();
        }

        // 会話文行（「……」など）は地の文ではないためスキップ
        if trimmed.starts_with('「') || trimmed.starts_with('『') {
            return Vec::new();
        }

        let mut sentences = Vec::new();
        let chars: Vec<char> = line.chars().collect();
        let mut in_bracket = false;
        let mut current_segment = String::new();

        for (i, &ch) in chars.iter().enumerate() {
            if ch == '「' || ch == '『' || ch == '（' {
                in_bracket = true;
            } else if ch == '」' || ch == '』' || ch == '）' {
                in_bracket = false;
            }

            if !in_bracket {
                current_segment.push(ch);

                // 句点「。」で文の区切りとみなす
                if ch == '。' {
                    let before_period = current_segment[..current_segment.len() - '。'.len_utf8()].trim();
                    let kind = Self::classify_ending(before_period);

                    let end_col = (i + 1) as u32;

                    sentences.push(SentenceInfo {
                        kind,
                        line: line_num,
                        end_col,
                    });

                    current_segment.clear();
                }
            }
        }

        // 行末に句点がない場合（体言止めなど）
        let remaining = current_segment.trim();
        if !remaining.is_empty() {
            let kind = Self::classify_ending(remaining);
            let end_col = chars.len() as u32;

            sentences.push(SentenceInfo {
                kind,
                line: line_num,
                end_col,
            });
        }

        sentences
    }

    /// 句点直前または文末の文字列から終止形カテゴリを判定
    fn classify_ending(text: &str) -> SentenceEndKind {
        if text.is_empty() {
            return SentenceEndKind::Other;
        }

        if text.ends_with("でした") || text.ends_with("です") {
            SentenceEndKind::Desu
        } else if text.ends_with("ました") || text.ends_with("ます") {
            SentenceEndKind::Masu
        } else if text.ends_with('た') || text.ends_with('だ') {
            SentenceEndKind::Ta
        } else {
            SentenceEndKind::Other
        }
    }
}

impl CalibrationRule for SentenceEndRepetitionRule {
    fn id(&self) -> &'static str {
        "novel-sentence-end-repetition"
    }

    fn name(&self) -> &'static str {
        "文末助動詞の連続重複検知"
    }

    fn rule_type(&self) -> &'static str {
        "novel_style"
    }

    fn default_enabled(&self) -> bool {
        self.default_enabled
    }

    fn check(&self, ctx: &CalibrationContext) -> Vec<CalibrationIssue> {
        let mut issues = Vec::new();
        let mut current_kind = SentenceEndKind::Other;
        let mut repeat_count = 0;

        for (line_idx, line) in ctx.lines.iter().enumerate() {
            let line_num = (line_idx + 1) as u32;
            let trimmed = line.trim();

            // 空行や会話行の場合は連続カウントをリセット（段落や会話の境界）
            if trimmed.is_empty() || trimmed.starts_with('「') || trimmed.starts_with('『') {
                current_kind = SentenceEndKind::Other;
                repeat_count = 0;
                continue;
            }

            let sentences = self.extract_sentences_from_line(line, line_num);

            for sentence in sentences {
                if sentence.kind == SentenceEndKind::Other {
                    // 体言止めや動詞終止形などでリズムが切り替わった場合
                    current_kind = SentenceEndKind::Other;
                    repeat_count = 0;
                } else if sentence.kind == current_kind {
                    repeat_count += 1;
                    if repeat_count > self.max_allowed {
                        // 許容数を超えた文末を指摘
                        let start_col = if sentence.end_col >= 2 {
                            sentence.end_col - 1
                        } else {
                            sentence.end_col
                        };

                        issues.push(CalibrationIssue {
                            id: format!("end-rep-{}-{}", sentence.line, sentence.end_col),
                            rule_id: self.id().to_string(),
                            rule_type: self.rule_type().to_string(),
                            message: format!(
                                "文末助動詞（{}）が {} 回連続しています。文章のリズムが単調になっていないか確認してください",
                                sentence.kind.label(),
                                repeat_count
                            ),
                            range: CalibrationRange {
                                start_line: sentence.line,
                                start_column: start_col,
                                end_line: sentence.line,
                                end_column: sentence.end_col + 1,
                            },
                            suggestion: None,
                        });
                    }
                } else {
                    current_kind = sentence.kind;
                    repeat_count = 1;
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
    fn test_sentence_end_repetition_rule() {
        let rule = SentenceEndRepetitionRule::default();
        let lines = vec![
            "彼は立ち上がった。",       // 1回目 (Ta)
            "周囲を静かに見回した。",   // 2回目 (Ta)
            "そこには誰もいなかった。", // 3回目 (Ta) -> 指摘！
            "冷たい風が吹き抜けた。",   // 4回目 (Ta) -> 指摘！
            "空を見上げる。",           // Other (動詞終止形) -> リセット
            "彼は歩き出した。",         // 1回目 (Ta) -> 正常
            "「寒いな」",               // 会話文 -> リセット
            "彼は歩き続けた。",         // 1回目 (Ta) -> 正常
        ];

        let ctx = CalibrationContext {
            text: "",
            lines: &lines,
            tokens: &[],
        };

        let issues = rule.check(&ctx);
        assert_eq!(issues.len(), 2);
        assert_eq!(issues[0].range.start_line, 3);
        assert_eq!(issues[1].range.start_line, 4);
        assert!(issues[0].message.contains("3 回連続"));
        assert!(issues[1].message.contains("4 回連続"));
    }
}
