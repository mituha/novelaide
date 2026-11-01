use std::borrow::Cow;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tauri::{plugin::PluginApi, AppHandle, Runtime};
use serde::de::DeserializeOwned;
use lindera::dictionary::load_dictionary;
use lindera::mode::Mode;
use lindera::segmenter::Segmenter;
use tauri_plugin_novelaid_ruby::strip_ruby_with_map;

use crate::models::*;
use crate::rules::context::{AnalyzedToken, CalibrationContext};
use crate::rules::RuleRegistry;
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
    rule_registry: Arc<RuleRegistry>,
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
#[allow(dead_code)]
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

/// clean_text のバイトオフセットから char_map 上の元位置 (line, column) を解決するヘルパー
pub fn resolve_source_range(
    char_map: &[tauri_plugin_novelaid_ruby::SourcePosition],
    byte_to_char: &[usize],
    byte_start: usize,
    byte_end: usize,
) -> (u32, u32, u32, u32) {
    if char_map.is_empty() {
        return (1, 1, 1, 1);
    }

    let start_char_idx = *byte_to_char.get(byte_start).unwrap_or(&0);
    let end_char_idx = *byte_to_char.get(byte_end).unwrap_or(&char_map.len());

    let (start_line, start_col) = if let Some(pos) = char_map.get(start_char_idx) {
        (pos.line, pos.column)
    } else {
        let last = char_map.last().unwrap();
        (last.line, last.column + 1)
    };

    let (end_line, end_col) = if end_char_idx > start_char_idx {
        if let Some(pos) = char_map.get(end_char_idx - 1) {
            (pos.line, pos.column + 1)
        } else {
            (start_line, start_col + 1)
        }
    } else {
        (start_line, start_col + 1)
    };

    (start_line, start_col, end_line, end_col)
}

/// clean_text の各バイト位置に対応する char_map の文字インデックス配列を生成
pub fn build_byte_to_char_index(clean_text: &str, total_chars: usize) -> Vec<usize> {
    let mut byte_to_char = Vec::with_capacity(clean_text.len() + 1);
    for (char_idx, (b_idx, _)) in clean_text.char_indices().enumerate() {
        while byte_to_char.len() < b_idx {
            byte_to_char.push(char_idx.saturating_sub(1));
        }
        byte_to_char.push(char_idx);
    }
    while byte_to_char.len() <= clean_text.len() {
        byte_to_char.push(total_chars);
    }
    byte_to_char
}

impl<R: Runtime> NovelaidCalibration<R> {
    pub fn new(app: AppHandle<R>) -> Result<Self> {
        let dictionary = load_dictionary("embedded://ipadic")
            .map_err(|e| Error::Lindera(e.to_string()))?;
        let segmenter = Segmenter::new(Mode::Normal, dictionary, None);
        let rule_registry = RuleRegistry::new_with_defaults();

        Ok(Self {
            _app: app,
            segmenter: Arc::new(RwLock::new(segmenter)),
            rule_registry: Arc::new(rule_registry),
        })
    }

    pub fn ping(&self, payload: PingRequest) -> Result<PingResponse> {
        Ok(PingResponse {
            value: payload.value,
        })
    }

    /// 形態素解析を実行しトークン列を取得（ルビ・傍点を除外した自然文として解析）
    pub fn tokenize_text(&self, text: &str) -> Result<Vec<TokenInfo>> {
        let stripped = strip_ruby_with_map(text);
        let segmenter = self.segmenter.read().map_err(|e| Error::Other(e.to_string()))?;
        let mut tokens = segmenter
            .segment(Cow::Borrowed(&stripped.clean_text))
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

    /// 本文中の難読・漢字語句に対するルビ候補を抽出（既存ルビの重複提案防止および元位置マッピング対応）
    pub fn get_ruby_candidates(&self, text: &str) -> Result<Vec<RubyCandidate>> {
        let stripped = strip_ruby_with_map(text);
        let byte_to_char = build_byte_to_char_index(&stripped.clean_text, stripped.char_map.len());

        let segmenter = self.segmenter.read().map_err(|e| Error::Other(e.to_string()))?;
        let mut tokens = segmenter
            .segment(Cow::Borrowed(&stripped.clean_text))
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
                            let (start_line, start_col, end_line, end_col) =
                                resolve_source_range(&stripped.char_map, &byte_to_char, byte_start, byte_end);

                            // 既にルビが振られている語句（existing_rubies）と重複しているか判定
                            let is_already_rubied = stripped.existing_rubies.iter().any(|r| {
                                r.start.line == start_line
                                    && r.start.column <= start_col
                                    && end_col <= r.end.column
                            });

                            if !is_already_rubied {
                                seen_words.insert(surface.clone());

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
        }

        Ok(candidates)
    }

    /// 文章校正チェックおよび文体比率集計の本実装（ルビ除去自然文での高精度解析＆元位置復元）
    pub fn check_text(&self, text: &str) -> Result<CheckTextResult> {
        let stripped = strip_ruby_with_map(text);
        let byte_to_char = build_byte_to_char_index(&stripped.clean_text, stripped.char_map.len());

        let mut kanji_count = 0;
        let mut hiragana_count = 0;
        let mut total_chars = 0;

        // 1. ルビ除去後の自然文から文字種比率を集計（記法記号やルビによる歪みを完全に排除）
        for c in stripped.clean_text.chars() {
            if !c.is_whitespace() {
                total_chars += 1;
            }
            if ('\u{4E00}'..='\u{9FFF}').contains(&c) {
                kanji_count += 1;
            } else if ('\u{3040}'..='\u{309F}').contains(&c) {
                hiragana_count += 1;
            }
        }

        // 2. Lindera 形態素解析によるトークン情報解決および頻出語集計
        let mut word_counts: HashMap<String, (u32, String)> = HashMap::new();
        let mut analyzed_tokens = Vec::new();

        let segmenter = self.segmenter.read().map_err(|e| Error::Other(e.to_string()))?;
        let mut tokens = segmenter
            .segment(Cow::Borrowed(&stripped.clean_text))
            .map_err(|e| Error::Lindera(e.to_string()))?;

        for t in tokens.iter_mut() {
            let surface = t.surface.to_string();
            let byte_start = t.byte_start;
            let byte_end = t.byte_end;
            let details = t.details();
            let pos_main = details.get(0).copied().unwrap_or("*").to_string();
            let pos_sub1 = details.get(1).copied().unwrap_or("*").to_string();
            let reading = details.get(7).and_then(|&s| if s == "*" { None } else { Some(s.to_string()) });

            // 元テキスト上の正確な行・列を復元
            let (start_line, start_column, end_line, end_column) =
                resolve_source_range(&stripped.char_map, &byte_to_char, byte_start, byte_end);

            analyzed_tokens.push(AnalyzedToken {
                surface: surface.clone(),
                pos_main: pos_main.clone(),
                pos_sub1: pos_sub1.clone(),
                reading,
                start_line,
                start_column,
                end_line,
                end_column,
            });

            // 頻出語集計: 名詞（自立・固有名詞等）で2文字以上（ルビ読み仮名の混入を完全遮断）
            if pos_main == "名詞" && pos_sub1 != "代名詞" && pos_sub1 != "非自立" && pos_sub1 != "数" {
                if surface.chars().count() >= 2 {
                    let entry = word_counts.entry(surface).or_insert((0, pos_sub1));
                    entry.0 += 1;
                }
            }
        }

        // 3. ルールエンジン（RuleRegistry）による一括校正チェック
        let lines: Vec<&str> = text.lines().collect();
        let ctx = CalibrationContext {
            text,
            lines: &lines,
            tokens: &analyzed_tokens,
        };
        let issues = self.rule_registry.check_all(&ctx, None);

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
    use super::*;
    use std::borrow::Cow;
    use lindera::dictionary::load_dictionary;
    use lindera::mode::Mode;
    use lindera::segmenter::Segmenter;
    use crate::rules::brackets::{is_closing_bracket, is_opening_bracket, get_matching_closing_bracket};
    use crate::rules::exclamation_space::{is_exclamation_question, is_space};

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
        assert!(is_closing_bracket('」'));
        assert!(is_closing_bracket('』'));
        assert!(is_closing_bracket('）'));
        assert!(is_closing_bracket(')'));
        assert!(is_closing_bracket('】'));
        assert!(is_closing_bracket('》'));
        assert!(!is_closing_bracket('あ'));

        assert!(is_opening_bracket('「'));
        assert!(is_opening_bracket('『'));
        assert!(is_opening_bracket('（'));
        assert_eq!(get_matching_closing_bracket('「'), Some('」'));
        assert_eq!(get_matching_closing_bracket('（'), Some('）'));

        assert!(is_exclamation_question('！'));
        assert!(is_exclamation_question('？'));
        assert!(is_exclamation_question('!'));
        assert!(is_exclamation_question('?'));
        assert!(!is_exclamation_question('。'));

        assert!(is_space('　'));
        assert!(is_space(' '));
        assert!(is_space('\t'));
        assert!(!is_space('a'));
    }

    #[test]
    fn test_exclamation_space_logic() {
        // 判定ロジックの単体テスト
        fn check_exclamation_issues(text: &str) -> Vec<String> {
            let mut issues = Vec::new();
            let chars: Vec<char> = text.chars().collect();
            for (ci, &c) in chars.iter().enumerate() {
                if is_exclamation_question(c) && ci + 1 < chars.len() {
                    let next = chars[ci + 1];
                    if !is_space(next) && !is_closing_bracket(next) && !is_exclamation_question(next) {
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

    #[test]
    fn test_no_half_width_space_and_full_width_pipe() {
        let text = "これは 半角空白 と ｜全角パイプ《ルビ》 のテスト。";
        let chars: Vec<char> = text.chars().collect();
        let mut space_issues = Vec::new();
        let mut pipe_issues = Vec::new();

        for (ci, &c) in chars.iter().enumerate() {
            if c == ' ' {
                space_issues.push(ci);
            }
            if c == '｜' {
                pipe_issues.push(ci);
            }
        }

        assert_eq!(space_issues.len(), 4);
        assert_eq!(pipe_issues.len(), 1);
    }

    #[test]
    fn test_rule_registry_defaults_integration() {
        let registry = super::RuleRegistry::new_with_defaults();
        let text = "　これは 半角空白 と ｜全角パイプ です。「句点。」";
        let lines: Vec<&str> = text.lines().collect();
        let ctx = super::CalibrationContext {
            text,
            lines: &lines,
            tokens: &[],
        };

        let issues = registry.check_all(&ctx, None);
        // 半角空白4箇所 + 全角パイプ1箇所 + 会話文末句点1箇所 = 計6件
        assert_eq!(issues.len(), 6);
        assert_eq!(issues[0].rule_id, "novel-no-half-width-space");
        assert_eq!(issues[issues.len() - 1].rule_id, "novel-closing-period");
    }

    #[test]
    fn test_resolve_source_range_with_ruby() {
        let text = "|東京《とうきょう》特許許可局";
        let stripped = strip_ruby_with_map(text);
        assert_eq!(stripped.clean_text, "東京特許許可局");

        let byte_to_char = build_byte_to_char_index(&stripped.clean_text, stripped.char_map.len());

        // 1. 親文字「東京」: clean_text 上のバイト範囲は 0..6 (UTF-8で3バイト*2文字)
        let (s_line, s_col, e_line, e_col) =
            resolve_source_range(&stripped.char_map, &byte_to_char, 0, 6);
        assert_eq!(s_line, 1);
        assert_eq!(s_col, 2); // 元テキストの | の次 = 2列目
        assert_eq!(e_line, 1);
        assert_eq!(e_col, 4); // 元テキストの 東京 の終端 = 4列目

        // 2. 後続単語「特許」: clean_text 上のバイト範囲は 6..12
        let (s_line2, s_col2, e_line2, e_col2) =
            resolve_source_range(&stripped.char_map, &byte_to_char, 6, 12);
        assert_eq!(s_line2, 1);
        assert_eq!(s_col2, 11); // 元テキストの 》 の次 = 11列目！
        assert_eq!(e_line2, 1);
        assert_eq!(e_col2, 13);
    }
}
