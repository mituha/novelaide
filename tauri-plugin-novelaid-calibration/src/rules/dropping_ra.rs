use std::collections::HashSet;
use crate::models::{CalibrationIssue, CalibrationRange};
use crate::rules::context::CalibrationContext;
use crate::rules::CalibrationRule;

/// ら抜き言葉の語幹と正しい可能動詞の語幹定義
struct DroppingRaPattern {
    stem: &'static str,         // 一段・カ変動詞の語幹（例: "見", "食べ", "来"）
    correct_stem: &'static str, // 「ら」を補った語幹（例: "見ら", "食べら", "来ら"）
}

const DROPPING_RA_PATTERNS: &[DroppingRaPattern] = &[
    // 漢字語幹
    DroppingRaPattern { stem: "見", correct_stem: "見ら" },
    DroppingRaPattern { stem: "来", correct_stem: "来ら" },
    DroppingRaPattern { stem: "食べ", correct_stem: "食べら" },
    DroppingRaPattern { stem: "起き", correct_stem: "起きら" },
    DroppingRaPattern { stem: "寝", correct_stem: "寝ら" },
    DroppingRaPattern { stem: "出", correct_stem: "出ら" },
    DroppingRaPattern { stem: "着", correct_stem: "着ら" },
    DroppingRaPattern { stem: "信じ", correct_stem: "信じら" },
    DroppingRaPattern { stem: "考え", correct_stem: "考えら" },
    DroppingRaPattern { stem: "助け", correct_stem: "助けら" },
    DroppingRaPattern { stem: "逃げ", correct_stem: "逃げら" },
    DroppingRaPattern { stem: "決め", correct_stem: "決めら" },
    DroppingRaPattern { stem: "教え", correct_stem: "教えら" },
    DroppingRaPattern { stem: "変え", correct_stem: "変えら" },
    DroppingRaPattern { stem: "忘れ", correct_stem: "忘れら" },
    DroppingRaPattern { stem: "生き", correct_stem: "生きら" },
    DroppingRaPattern { stem: "止め", correct_stem: "止めら" },
    DroppingRaPattern { stem: "開け", correct_stem: "開けら" },
    DroppingRaPattern { stem: "受け", correct_stem: "受けら" },
    DroppingRaPattern { stem: "負け", correct_stem: "負けら" },
    DroppingRaPattern { stem: "耐え", correct_stem: "耐えら" },
    DroppingRaPattern { stem: "超え", correct_stem: "超えら" },
    DroppingRaPattern { stem: "越え", correct_stem: "越えら" },
    DroppingRaPattern { stem: "答え", correct_stem: "答えら" },
    DroppingRaPattern { stem: "感じ", correct_stem: "感じら" },
    DroppingRaPattern { stem: "閉じ", correct_stem: "閉じら" },
    DroppingRaPattern { stem: "落ち", correct_stem: "落ちら" },
    DroppingRaPattern { stem: "降り", correct_stem: "降りら" },
    // ひらがな語幹（誤検知のない語幹）
    DroppingRaPattern { stem: "み", correct_stem: "みら" },
    DroppingRaPattern { stem: "こ", correct_stem: "こら" },
    DroppingRaPattern { stem: "ね", correct_stem: "ねら" },
    DroppingRaPattern { stem: "たべ", correct_stem: "たべら" },
    DroppingRaPattern { stem: "おき", correct_stem: "おきら" },
    DroppingRaPattern { stem: "しんじ", correct_stem: "しんじら" },
    DroppingRaPattern { stem: "かんがえ", correct_stem: "かんがえら" },
    DroppingRaPattern { stem: "たすけ", correct_stem: "たすけら" },
    DroppingRaPattern { stem: "にげ", correct_stem: "にげら" },
    DroppingRaPattern { stem: "きめ", correct_stem: "きめら" },
    DroppingRaPattern { stem: "おしえ", correct_stem: "おしえら" },
    DroppingRaPattern { stem: "わすれ", correct_stem: "わすれら" },
    DroppingRaPattern { stem: "いき", correct_stem: "いきら" },
    DroppingRaPattern { stem: "とめ", correct_stem: "とめら" },
    DroppingRaPattern { stem: "あけ", correct_stem: "あけら" },
    DroppingRaPattern { stem: "うけ", correct_stem: "うけら" },
    DroppingRaPattern { stem: "まけ", correct_stem: "まけら" },
    DroppingRaPattern { stem: "たえ", correct_stem: "たえら" },
    DroppingRaPattern { stem: "こたえ", correct_stem: "こたえら" },
    DroppingRaPattern { stem: "かんじ", correct_stem: "かんじら" },
    DroppingRaPattern { stem: "とじ", correct_stem: "とじら" },
    DroppingRaPattern { stem: "おち", correct_stem: "おちら" },
    DroppingRaPattern { stem: "おり", correct_stem: "おりら" },
];

/// ら抜き活用の語尾パターン（最長一致のため長い順に並べる。「れ」単独は「これ」等と混同するため除外）
const SUFFIXES: &[&str] = &[
    "れません", "れれば", "れない", "れなく", "れた", "れて", "れる",
];

/// ら抜き言葉検知ルール
pub struct DroppingRaRule {
    pub default_enabled: bool,
}

impl Default for DroppingRaRule {
    fn default() -> Self {
        Self {
            default_enabled: true,
        }
    }
}

impl CalibrationRule for DroppingRaRule {
    fn id(&self) -> &'static str {
        "no-dropping-ra"
    }

    fn name(&self) -> &'static str {
        "ら抜き言葉検知"
    }

    fn rule_type(&self) -> &'static str {
        "grammar"
    }

    fn default_enabled(&self) -> bool {
        self.default_enabled
    }

    fn check(&self, ctx: &CalibrationContext) -> Vec<CalibrationIssue> {
        let mut issues = Vec::new();

        for (line_idx, line) in ctx.lines.iter().enumerate() {
            let line_num = (line_idx + 1) as u32;
            let mut covered_ranges: HashSet<(usize, usize)> = HashSet::new();

            for pattern in DROPPING_RA_PATTERNS {
                for suffix in SUFFIXES {
                    let target = format!("{}{}", pattern.stem, suffix);

                    for (byte_offset, _) in line.match_indices(&target) {
                        let byte_end = byte_offset + target.len();

                        // 既に包含されている範囲ならスキップ（最長一致保護）
                        let already_covered = covered_ranges.iter().any(|&(s, e)| {
                            byte_offset >= s && byte_end <= e
                        });
                        if already_covered {
                            continue;
                        }

                        let start_col = line[..byte_offset].chars().count() as u32 + 1;
                        let target_len = target.chars().count() as u32;
                        let end_col = start_col + target_len;

                        let suggested = format!("{}{}", pattern.correct_stem, suffix);

                        covered_ranges.insert((byte_offset, byte_end));

                        issues.push(CalibrationIssue {
                            id: format!("dropping-ra-{}-{}-{}", pattern.stem, line_num, start_col),
                            rule_id: self.id().to_string(),
                            rule_type: self.rule_type().to_string(),
                            message: format!(
                                "ら抜き言葉「{}」が使われています。「{}」への修正を推奨します",
                                target, suggested
                            ),
                            range: CalibrationRange {
                                start_line: line_num,
                                start_column: start_col,
                                end_line: line_num,
                                end_column: end_col,
                            },
                            suggestion: Some(suggested),
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
    fn test_dropping_ra_rule() {
        let rule = DroppingRaRule::default();
        let lines = vec![
            "ここから星が見れるよ。",       // 見れる -> 指摘（見られる）
            "全部食べれた？",               // 食べれた -> 指摘（食べられた）
            "明日来れないかも。",           // 来れない -> 指摘（来られない）
            "ここから星が見られるよ。",     // 正しい表現 -> 正常
            "手紙を書ける。",               // 五段動詞可能形 -> 正常
            "日本語を話せる。",             // 五段動詞可能形 -> 正常
            "これはペンです。",             // 「これ」で誤検知しない -> 正常
        ];
        let ctx = CalibrationContext {
            text: "ここから星が見れるよ。\n全部食べれた？\n明日来れないかも。\nここから星が見られるよ。\n手紙を書ける。\n日本語を話せる。\nこれはペンです。",
            lines: &lines,
            tokens: &[],
        };

        let issues = rule.check(&ctx);
        assert_eq!(issues.len(), 3);
        assert_eq!(issues[0].range.start_line, 1);
        assert_eq!(issues[0].suggestion, Some("見られる".into()));
        assert_eq!(issues[1].range.start_line, 2);
        assert_eq!(issues[1].suggestion, Some("食べられた".into()));
        assert_eq!(issues[2].range.start_line, 3);
        assert_eq!(issues[2].suggestion, Some("来られない".into()));
    }
}
