use std::borrow::Cow;
use std::collections::HashMap;
use std::io::Cursor;
use std::sync::{Arc, RwLock};
use tauri::{plugin::PluginApi, AppHandle, Runtime};
use serde::de::DeserializeOwned;
use lindera::dictionary::{load_dictionary, Dictionary, DictionaryBuilder, Metadata, UserDictionary};
use lindera::mode::Mode;
use lindera::segmenter::Segmenter;
use tauri_plugin_novelaid_ruby::strip_ruby_with_map;

use crate::models::*;
use crate::rules::context::{AnalyzedToken, CalibrationContext};
use crate::rules::RuleRegistry;
use crate::{Error, Result};

/// デフォルトで登録するラノベ・創作小説向けの組み込みキャラクター語尾
pub const DEFAULT_NOVEL_USER_DICT_CSV: &str = "\
わん,\"助詞,終助詞\",ワン
にゃん,\"助詞,終助詞\",ニャン
ぱう,\"助詞,終助詞\",パウ
ぴょん,\"助詞,終助詞\",ピョン
ぽよ,\"助詞,終助詞\",ポヨ
っす,\"助詞,終助詞\",ッス
のじゃ,\"助詞,終助詞\",ノジャ
なのじゃ,\"助詞,終助詞\",ナノジャ
ござる,\"助詞,終助詞\",ゴザル
でござる,\"助詞,終助詞\",デゴザル
";

/// ユーザー辞書 CSV から Lindera の UserDictionary をメモリ上で構築する
pub fn build_user_dictionary(
    metadata: &Metadata,
    csv_data: &str,
) -> Result<UserDictionary> {
    let builder = DictionaryBuilder::new(metadata.clone());
    builder
        .build_user_dict_from_reader(Cursor::new(csv_data))
        .map_err(|e| Error::Lindera(e.to_string()))
}

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> Result<NovelaidCalibration<R>> {
    NovelaidCalibration::new(app.clone())
}

pub struct NovelaidCalibration<R: Runtime> {
    _app: AppHandle<R>,
    dictionary: Arc<Dictionary>,
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
        let user_dict = build_user_dictionary(&dictionary.metadata, DEFAULT_NOVEL_USER_DICT_CSV)?;
        let segmenter = Segmenter::new(Mode::Normal, dictionary.clone(), Some(user_dict));
        let rule_registry = RuleRegistry::new_with_defaults();

        Ok(Self {
            _app: app,
            dictionary: Arc::new(dictionary),
            segmenter: Arc::new(RwLock::new(segmenter)),
            rule_registry: Arc::new(rule_registry),
        })
    }

    /// 組み込み語尾に加え、プロジェクト固有の辞書 CSV を動的に結合して Segmenter を再構築する
    pub fn reload_user_dictionary(&self, additional_csv: Option<&str>) -> Result<()> {
        let combined_csv = if let Some(extra) = additional_csv {
            format!("{}\n{}", DEFAULT_NOVEL_USER_DICT_CSV.trim(), extra.trim())
        } else {
            DEFAULT_NOVEL_USER_DICT_CSV.to_string()
        };

        let user_dict = build_user_dictionary(&self.dictionary.metadata, &combined_csv)?;
        let new_segmenter = Segmenter::new(Mode::Normal, (*self.dictionary).clone(), Some(user_dict));

        let mut segmenter_lock = self.segmenter.write().map_err(|e| Error::Other(e.to_string()))?;
        *segmenter_lock = new_segmenter;
        Ok(())
    }

    pub fn ping(&self, payload: PingRequest) -> Result<PingResponse> {
        Ok(PingResponse {
            value: payload.value,
        })
    }

    /// 形態素解析を実行しトークン列を取得（ルビ・傍点を除外した自然文として解析＆元位置復元）
    pub fn tokenize_text(&self, text: &str) -> Result<Vec<TokenInfo>> {
        let stripped = strip_ruby_with_map(text);
        let byte_to_char = build_byte_to_char_index(&stripped.clean_text, stripped.char_map.len());
        let segmenter = self.segmenter.read().map_err(|e| Error::Other(e.to_string()))?;
        let mut tokens = segmenter
            .segment(Cow::Borrowed(&stripped.clean_text))
            .map_err(|e| Error::Lindera(e.to_string()))?;

        let mut result = Vec::with_capacity(tokens.len());
        for t in tokens.iter_mut() {
            let surface = t.surface.to_string();
            let byte_start = t.byte_start;
            let byte_end = t.byte_end;
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

            let (start_line, start_column, end_line, end_column) =
                resolve_source_range(&stripped.char_map, &byte_to_char, byte_start, byte_end);

            result.push(TokenInfo {
                surface,
                pos,
                reading,
                base_form,
                range: Some(CalibrationRange {
                    start_line,
                    start_column,
                    end_line,
                    end_column,
                }),
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

            // 頻出語集計: 名詞（自立・固有名詞等、1文字語句も含む全件集計）
            if pos_main == "名詞" && pos_sub1 != "代名詞" && pos_sub1 != "非自立" && pos_sub1 != "数" {
                let entry = word_counts.entry(surface).or_insert((0, pos_sub1));
                entry.0 += 1;
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

        // 頻出語ランキングのソート（出現回数降順、同順位は50音順）
        let mut freq_list: Vec<(String, u32, String)> = word_counts
            .into_iter()
            .map(|(w, (c, p))| (w, c, p))
            .collect();
        freq_list.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

        // 全件リスト（1文字語句も含む）
        let all_frequencies: Vec<FrequencyItem> = freq_list
            .iter()
            .map(|(w, c, p)| FrequencyItem {
                word: w.clone(),
                count: *c,
                pos: p.clone(),
            })
            .collect();

        // 従来互換: 2文字以上の上位15件
        let frequencies: Vec<FrequencyItem> = freq_list
            .into_iter()
            .filter(|(w, _, _)| w.chars().count() >= 2)
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
            all_frequencies,
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
    fn test_character_endings_user_dict() {
        let dictionary = load_dictionary("embedded://ipadic").expect("Failed to load embedded ipadic");

        // 1. 辞書なしでの挙動確認: 「にゃん」が「にゃ(助詞)」+「ん(助動詞)」に分断される
        let default_segmenter = Segmenter::new(Mode::Normal, dictionary.clone(), None);
        let sample_text = "そうだわん！　あっちにゃん。不思議ぱう。知っておるのじゃ。真実なのじゃ。了解っす！";
        let mut default_tokens = default_segmenter.segment(Cow::Borrowed(sample_text)).unwrap();
        assert!(default_tokens.iter_mut().any(|t| t.surface == "にゃ"));

        // 2. 組み込みデフォルト語尾辞書の適用
        let user_dict = build_user_dictionary(&dictionary.metadata, DEFAULT_NOVEL_USER_DICT_CSV)
            .expect("Failed to build user dict");

        let custom_segmenter = Segmenter::new(Mode::Normal, dictionary, Some(user_dict));
        let mut custom_tokens = custom_segmenter.segment(Cow::Borrowed(sample_text)).unwrap();

        // 3. ユーザー辞書適用後は各語尾が1トークン（カスタム語尾）として抽出される
        let surfaces: Vec<String> = custom_tokens.iter().map(|t| t.surface.to_string()).collect();
        assert!(surfaces.contains(&"わん".to_string()));
        assert!(surfaces.contains(&"にゃん".to_string()));
        assert!(surfaces.contains(&"ぱう".to_string()));
        assert!(surfaces.contains(&"のじゃ".to_string()));
        assert!(surfaces.contains(&"なのじゃ".to_string()));
        assert!(surfaces.contains(&"っす".to_string()));

        // 「にゃん」の詳細（品詞および読み）を検証
        let nyan_token = custom_tokens.iter_mut().find(|t| t.surface == "にゃん").unwrap();
        let details = nyan_token.details();
        assert_eq!(details[0], "助詞,終助詞");
        assert_eq!(details[7], "ニャン");

        // 「のじゃ」の詳細（品詞および読み）を検証
        let noja_token = custom_tokens.iter_mut().find(|t| t.surface == "のじゃ").unwrap();
        let details = noja_token.details();
        assert_eq!(details[0], "助詞,終助詞");
        assert_eq!(details[7], "ノジャ");
    }

    #[test]
    fn test_reload_user_dictionary() {
        let dictionary = load_dictionary("embedded://ipadic").expect("Failed to load embedded ipadic");
        let user_dict = build_user_dictionary(&dictionary.metadata, DEFAULT_NOVEL_USER_DICT_CSV)
            .expect("Failed to build user dict");
        let segmenter = Segmenter::new(Mode::Normal, dictionary.clone(), Some(user_dict));

        struct DummyState {
            dictionary: Arc<Dictionary>,
            segmenter: Arc<RwLock<Segmenter>>,
        }
        let state = DummyState {
            dictionary: Arc::new(dictionary),
            segmenter: Arc::new(RwLock::new(segmenter)),
        };

        // 追加のプロジェクト固有辞書を動的リロード
        let additional_csv = "クポ,カスタム語尾,クポ\nぴぴぴ,カスタム語尾,ピピピ\n";
        let combined_csv = format!("{}\n{}", DEFAULT_NOVEL_USER_DICT_CSV.trim(), additional_csv.trim());
        let new_user_dict = build_user_dictionary(&state.dictionary.metadata, &combined_csv).unwrap();
        let new_segmenter = Segmenter::new(Mode::Normal, (*state.dictionary).clone(), Some(new_user_dict));
        *state.segmenter.write().unwrap() = new_segmenter;

        // 検証: 初期語尾「にゃん」と動的追加「クポ」「ぴぴぴ」の両方が1トークンとして認識されること
        let text = "元気クポ！　受信ぴぴぴ。あっちにゃん。";
        let segmenter_read = state.segmenter.read().unwrap();
        let tokens = segmenter_read.segment(Cow::Borrowed(text)).unwrap();
        let surfaces: Vec<String> = tokens.iter().map(|t| t.surface.to_string()).collect();
        assert!(surfaces.contains(&"クポ".to_string()));
        assert!(surfaces.contains(&"ぴぴぴ".to_string()));
        assert!(surfaces.contains(&"にゃん".to_string()));
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
