use std::borrow::Cow;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tauri::{plugin::PluginApi, AppHandle, Runtime};
use serde::de::DeserializeOwned;
use lindera::dictionary::load_dictionary;
use lindera::mode::Mode;
use lindera::segmenter::Segmenter;

use crate::models::*;
use crate::{Error, Result};

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> Result<NovelaidCalibration<R>> {
    NovelaidCalibration::new(app.clone())
}

pub struct NovelaidCalibration<R: Runtime> {
    _app: AppHandle<R>,
    segmenter: Arc<RwLock<Segmenter>>,
}

/// カタカナ文字列をひらがなに変換する
pub fn katakana_to_hiragana(katakana: &str) -> String {
    katakana
        .chars()
        .map(|c| {
            if ('\u{30A1}'..='\u{30F6}').contains(&c) {
                // カタカナ(0x30A1-0x30F6)から0x60を引くとひらがな(0x3041-0x3096)
                char::from_u32(c as u32 - 0x60).unwrap_or(c)
            } else {
                c
            }
        })
        .collect()
}

/// 漢字を含むか判定する
pub fn contains_kanji(s: &str) -> bool {
    s.chars().any(|c| ('\u{4E00}'..='\u{9FFF}').contains(&c))
}

/// バイトオフセットから 1-based の行番号・列番号を算出する
pub fn byte_offset_to_line_col(text: &str, byte_offset: usize) -> (u32, u32) {
    let mut line = 1u32;
    let mut col = 1u32;
    for (i, c) in text.char_indices() {
        if i >= byte_offset {
            break;
        }
        if c == '\n' {
            line += 1;
            col = 1;
        } else {
            col += 1;
        }
    }
    (line, col)
}

/// 閉じ括弧文字かどうかを判定する
pub fn is_closing_bracket(c: char) -> bool {
    matches!(
        c,
        '」' | '』' | '）' | ')' | '】' | '］' | ']' | '｝' | '}' | '〉' | '》' | '〕' | '”' | '"' | '’' | '\''
    )
}

/// 感嘆符・疑問符かどうかを判定する
pub fn is_exclamation_question(c: char) -> bool {
    matches!(c, '！' | '？' | '!' | '?')
}

/// 空白文字（全角・半角・タブ）かどうかを判定する
pub fn is_space(c: char) -> bool {
    c == '　' || c == ' ' || c == '\t'
}

impl<R: Runtime> NovelaidCalibration<R> {
    pub fn new(app: AppHandle<R>) -> Result<Self> {
        let dictionary = load_dictionary("embedded://ipadic")
            .map_err(|e| Error::Lindera(e.to_string()))?;
        let segmenter = Segmenter::new(Mode::Normal, dictionary, None);

        Ok(Self {
            _app: app,
            segmenter: Arc::new(RwLock::new(segmenter)),
        })
    }

    pub fn ping(&self, payload: PingRequest) -> Result<PingResponse> {
        Ok(PingResponse {
            value: payload.value,
        })
    }

    /// 形態素解析を実行しトークン列を取得
    pub fn tokenize_text(&self, text: &str) -> Result<Vec<TokenInfo>> {
        let segmenter = self.segmenter.read().map_err(|e| Error::Other(e.to_string()))?;
        let mut tokens = segmenter
            .segment(Cow::Borrowed(text))
            .map_err(|e| Error::Lindera(e.to_string()))?;

        let mut result = Vec::with_capacity(tokens.len());
        for t in tokens.iter_mut() {
            let surface = t.surface.to_string();
            let details = t.details();

            let pos_parts: Vec<&str> = details.iter()
                .take(4)
                .copied()
                .filter(|s| *s != "*")
                .collect();

            let pos = if pos_parts.is_empty() {
                "不明".to_string()
            } else {
                pos_parts.join(",")
            };

            let base_form = details.get(6).and_then(|s| {
                if *s == "*" { None } else { Some(s.to_string()) }
            });

            let reading = details.get(7).and_then(|s| {
                if *s == "*" { None } else { Some(s.to_string()) }
            });

            result.push(TokenInfo {
                surface,
                pos,
                reading,
                base_form,
            });
        }

        Ok(result)
    }

    /// 本文中の難読・漢字語句に対するルビ候補を抽出
    pub fn get_ruby_candidates(&self, text: &str) -> Result<Vec<RubyCandidate>> {
        let segmenter = self.segmenter.read().map_err(|e| Error::Other(e.to_string()))?;
        let mut tokens = segmenter
            .segment(Cow::Borrowed(text))
            .map_err(|e| Error::Lindera(e.to_string()))?;

        let mut candidates = Vec::new();
        let mut seen_words = std::collections::HashSet::new();

        for t in tokens.iter_mut() {
            let surface = t.surface.to_string();
            let byte_start = t.byte_start;
            let byte_end = t.byte_end;

            // 漢字を含む2文字以上の単語を対象とする
            if surface.chars().count() >= 2 && contains_kanji(&surface) {
                let details = t.details();
                if let Some(&katakana_reading) = details.get(7) {
                    if katakana_reading != "*" {
                        let hiragana = katakana_to_hiragana(katakana_reading);

                        // 表層形と同じ（ひらがなのみ等）でなく、まだ未登録の語句
                        if hiragana != surface && !seen_words.contains(&surface) {
                            seen_words.insert(surface.clone());

                            let (start_line, start_col) = byte_offset_to_line_col(text, byte_start);
                            let (end_line, end_col) = byte_offset_to_line_col(text, byte_end);

                            candidates.push(RubyCandidate {
                                surface,
                                ruby: hiragana,
                                range: CalibrationRange {
                                    start_line,
                                    start_column: start_col,
                                    end_line,
                                    end_column: end_col,
                                },
                            });
                        }
                    }
                }
            }
        }

        Ok(candidates)
    }

    /// 文章校正チェックおよび文体比率集計の本実装
    pub fn check_text(&self, text: &str) -> Result<CheckTextResult> {
        let mut issues = Vec::new();
        let mut kanji_count = 0;
        let mut hiragana_count = 0;
        let mut total_chars = 0;

        // 1. 文字種比率および行単位の簡易小説作法チェック
        let lines: Vec<&str> = text.lines().collect();
        for (line_idx, line) in lines.iter().enumerate() {
            let line_num = (line_idx + 1) as u32;

            for c in line.chars() {
                total_chars += 1;
                if ('\u{4E00}'..='\u{9FFF}').contains(&c) {
                    kanji_count += 1;
                } else if ('\u{3040}'..='\u{309F}').contains(&c) {
                    hiragana_count += 1;
                }
            }

            // 作法チェック1: 会話文末の句点 (「〜〜。」)
            if line.contains("。」") {
                if let Some(col) = line.find("。」") {
                    issues.push(CalibrationIssue {
                        id: format!("closing-period-{}-{}", line_num, col),
                        rule_id: "novel-closing-period".into(),
                        rule_type: "novel_style".into(),
                        message: "かぎ括弧末尾の句点「。」は原則として省略します".into(),
                        range: CalibrationRange {
                            start_line: line_num,
                            start_column: (col + 1) as u32,
                            end_line: line_num,
                            end_column: (col + 3) as u32,
                        },
                        suggestion: Some("」".into()),
                    });
                }
            }

            // 作法チェック2: 三点リーダー1マス (単独の …)
            if line.contains('…') && !line.contains("……") {
                if let Some(col) = line.find('…') {
                    issues.push(CalibrationIssue {
                        id: format!("single-leader-{}-{}", line_num, col),
                        rule_id: "novel-three-dots-leader".into(),
                        rule_type: "novel_style".into(),
                        message: "三点リーダーは2マス（偶数「……」）で使用するのが作法です".into(),
                        range: CalibrationRange {
                            start_line: line_num,
                            start_column: (col + 1) as u32,
                            end_line: line_num,
                            end_column: (col + 2) as u32,
                        },
                        suggestion: Some("……".into()),
                    });
                }
            }

            // 作法チェック3: 感嘆符・疑問符の直後の空白チェック
            // ※「本当？」のように閉じ括弧が続く場合や行末、別の！？が連続する場合は空白不要。
            // ※ 直後に文章（文字）が続く場合のみ全角空白を要求する。
            let chars: Vec<char> = line.chars().collect();
            for (ci, &c) in chars.iter().enumerate() {
                if is_exclamation_question(c) && ci + 1 < chars.len() {
                    let next = chars[ci + 1];
                    // 空白、閉じ括弧、または別の感嘆符・疑問符が続く場合は正常（空白要求不要）
                    if !is_space(next) && !is_closing_bracket(next) && !is_exclamation_question(next) {
                        issues.push(CalibrationIssue {
                            id: format!("exclamation-space-{}-{}", line_num, ci),
                            rule_id: "novel-exclamation-space".into(),
                            rule_type: "novel_style".into(),
                            message: "感嘆符・疑問符の直後に文章が続く場合は全角空白を空けるのが通例です".into(),
                            range: CalibrationRange {
                                start_line: line_num,
                                start_column: (ci + 1) as u32,
                                end_line: line_num,
                                end_column: (ci + 2) as u32,
                            },
                            suggestion: Some(format!("{}　", c)),
                        });
                    }
                }
            }

            // 助詞「の」連続チェック（同一行で3回以上出現）
            let no_count = line.matches('の').count();
            if no_count >= 3 {
                issues.push(CalibrationIssue {
                    id: format!("doubled-joshi-no-{}", line_num),
                    rule_id: "no-doubled-joshi".into(),
                    rule_type: "particle_repetition".into(),
                    message: format!("同一行内で助詞「の」が{}回使われています。修飾の連続に注意してください", no_count),
                    range: CalibrationRange {
                        start_line: line_num,
                        start_column: 1,
                        end_line: line_num,
                        end_column: line.chars().count() as u32,
                    },
                    suggestion: None,
                });
            }
        }

        // 2. Lindera 形態素解析による高度な校正＆頻出語集計
        let mut word_counts: HashMap<String, (u32, String)> = HashMap::new();

        let segmenter = self.segmenter.read().map_err(|e| Error::Other(e.to_string()))?;
        let mut tokens = segmenter
            .segment(Cow::Borrowed(text))
            .map_err(|e| Error::Lindera(e.to_string()))?;

        for t in tokens.iter_mut() {
            let surface = t.surface.to_string();
            let byte_start = t.byte_start;
            let byte_end = t.byte_end;
            let details = t.details();
            let pos_main = details.get(0).copied().unwrap_or("*");
            let pos_sub1 = details.get(1).copied().unwrap_or("*");
            let (start_line, start_col) = byte_offset_to_line_col(text, byte_start);
            let (end_line, end_col) = byte_offset_to_line_col(text, byte_end);

            // 漢字の開きチェック: 「事」「時」「物」「所」が形式名詞・非自立として使われている場合
            if pos_main == "名詞" && (pos_sub1 == "非自立" || pos_sub1 == "形式名詞") {
                let (open_word, msg) = match surface.as_str() {
                    "事" => ("こと", "形式名詞「事」は平仮名「こと」で開くことが推奨されます"),
                    "時" => ("とき", "形式名詞「時」は平仮名「とき」で開くことが推奨されます"),
                    "物" => ("もの", "形式名詞「物」は平仮名「もの」で開くことが推奨されます"),
                    "所" => ("ところ", "形式名詞「所」は平仮名「ところ」で開くことが推奨されます"),
                    _ => ("", ""),
                };

                if !open_word.is_empty() {
                    issues.push(CalibrationIssue {
                        id: format!("kanji-open-{}-{}", start_line, start_col),
                        rule_id: "kanji-open-close".into(),
                        rule_type: "kanji_open_close".into(),
                        message: msg.into(),
                        range: CalibrationRange {
                            start_line,
                            start_column: start_col,
                            end_line,
                            end_column: end_col,
                        },
                        suggestion: Some(open_word.into()),
                    });
                }
            }

            // 頻出語集計: 名詞（自立・固有名詞等）で2文字以上
            if pos_main == "名詞" && pos_sub1 != "代名詞" && pos_sub1 != "非自立" && pos_sub1 != "数" {
                if surface.chars().count() >= 2 {
                    let entry = word_counts.entry(surface).or_insert((0, pos_sub1.to_string()));
                    entry.0 += 1;
                }
            }
        }

        // 頻出語ランキングのソート（上位15件）
        let mut freq_list: Vec<(String, u32, String)> = word_counts
            .into_iter()
            .map(|(w, (c, p))| (w, c, p))
            .collect();
        freq_list.sort_by(|a, b| b.1.cmp(&a.1));

        let frequencies = freq_list
            .into_iter()
            .take(15)
            .map(|(w, c, p)| FrequencyItem {
                word: w,
                count: c,
                pos: p,
            })
            .collect();

        let kanji_ratio = if total_chars > 0 {
            (kanji_count as f32 / total_chars as f32 * 100.0).round()
        } else {
            0.0
        };

        let hiragana_ratio = if total_chars > 0 {
            (hiragana_count as f32 / total_chars as f32 * 100.0).round()
        } else {
            0.0
        };

        Ok(CheckTextResult {
            issues,
            frequencies,
            total_chars,
            kanji_ratio,
            hiragana_ratio,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::borrow::Cow;
    use lindera::dictionary::load_dictionary;
    use lindera::mode::Mode;
    use lindera::segmenter::Segmenter;

    #[test]
    fn test_lindera_ipadic() {
        let dictionary = load_dictionary("embedded://ipadic").expect("Failed to load embedded ipadic");
        let segmenter = Segmenter::new(Mode::Normal, dictionary, None);
        let mut tokens = segmenter.segment(Cow::Borrowed("関西国際空港に行こう")).expect("Failed to segment");
        assert!(!tokens.is_empty());
        assert_eq!(tokens[0].surface, "関西国際空港");
        let details = tokens[0].details();
        assert_eq!(details[6], "関西国際空港");
        assert_eq!(details[7], "カンサイコクサイクウコウ");
        assert_eq!(super::katakana_to_hiragana(details[7]), "かんさいこくさいくうこう");
    }

    #[test]
    fn test_kana_to_hira() {
        assert_eq!(super::katakana_to_hiragana("コンニチハ"), "こんにちは");
        assert_eq!(super::katakana_to_hiragana("カイコウ"), "かいこう");
        assert_eq!(super::katakana_to_hiragana("アメ"), "あめ");
    }

    #[test]
    fn test_is_closing_bracket_and_helpers() {
        assert!(super::is_closing_bracket('」'));
        assert!(super::is_closing_bracket('』'));
        assert!(super::is_closing_bracket('）'));
        assert!(super::is_closing_bracket(')'));
        assert!(super::is_closing_bracket('】'));
        assert!(super::is_closing_bracket('》'));
        assert!(!super::is_closing_bracket('あ'));

        assert!(super::is_exclamation_question('！'));
        assert!(super::is_exclamation_question('？'));
        assert!(super::is_exclamation_question('!'));
        assert!(super::is_exclamation_question('?'));
        assert!(!super::is_exclamation_question('。'));

        assert!(super::is_space('　'));
        assert!(super::is_space(' '));
        assert!(super::is_space('\t'));
        assert!(!super::is_space('a'));
    }

    #[test]
    fn test_exclamation_space_logic() {
        // 判定ロジックの単体テスト
        fn check_exclamation_issues(text: &str) -> Vec<String> {
            let mut issues = Vec::new();
            let chars: Vec<char> = text.chars().collect();
            for (ci, &c) in chars.iter().enumerate() {
                if super::is_exclamation_question(c) && ci + 1 < chars.len() {
                    let next = chars[ci + 1];
                    if !super::is_space(next) && !super::is_closing_bracket(next) && !super::is_exclamation_question(next) {
                        issues.push(format!("{}:{}->{}", ci, c, next));
                    }
                }
            }
            issues
        }

        // 1. 閉じ括弧が続く場合は空白不要
        assert!(check_exclamation_issues("「本当？」").is_empty());
        assert!(check_exclamation_issues("『信じられない！』").is_empty());
        assert!(check_exclamation_issues("（えっ？）").is_empty());

        // 2. 行末の場合は空白不要
        assert!(check_exclamation_issues("本当？").is_empty());
        assert!(check_exclamation_issues("すごい！").is_empty());

        // 3. 既に空白がある場合は空白不要
        assert!(check_exclamation_issues("「本当？　そうなんだ」").is_empty());
        assert!(check_exclamation_issues("本当！　すごいね").is_empty());

        // 4. 感嘆符・疑問符が連続している場合（！？）
        // 末尾の記号の直後に文章が続く場合のみ指摘
        let issues = check_exclamation_issues("「本当！？そうなんだ」");
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0], "4:？->そ"); // 0:「 1:本 2:当 3:！ 4:？

        // 5. 直後に文章が続く場合は指摘
        let issues2 = check_exclamation_issues("本当？そうなんだ");
        assert_eq!(issues2.len(), 1);
        assert_eq!(issues2[0], "2:？->そ");
    }
}
