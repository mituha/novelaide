use regex::Regex;
use std::sync::LazyLock;
use crate::models::{RubyRange, SourcePosition, StrippedResultWithMap};

static RE_RUBY_WITH_PIPE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[|｜]([^|｜\n《》]+)《([^《》\n]+)》").expect("invalid regex for ruby with pipe")
});

static RE_RUBY_WITHOUT_PIPE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"([々〇\u{4e00}-\u{9fcf}\u{3400}-\u{4dbf}]+)《([^《》\n]+)》")
        .expect("invalid regex for ruby without pipe")
});

static RE_BOUTEN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"《《([^《》\n]+)》》").expect("invalid regex for bouten")
});

/// ルビ記法（半角パイプ統一）を生成
pub fn format_ruby(surface: &str, ruby: &str) -> String {
    format!("|{}《{}》", surface, ruby)
}

fn is_hiragana(c: char) -> bool {
    ('\u{3040}'..='\u{309F}').contains(&c)
}

fn is_kanji(c: char) -> bool {
    ('\u{4E00}'..='\u{9FFF}').contains(&c) || c == '々' || c == '〇'
}

/// スマート送り仮名分離ルビ生成
/// 表層形と読みの前後にある送り仮名（ひらがな）を自動検知して分離し、
/// 漢字部分のみにルビを振った記法（例: `|見下《みお》ろす`、`お|見舞《みま》い`）を生成する。
/// 当て字（ルビがカタカナ等）の場合は全体ルビ `|見下ろす《ルックダウン》` を保つ。
pub fn format_smart_ruby(surface: &str, ruby: &str) -> String {
    let s_chars: Vec<char> = surface.chars().collect();
    let r_chars: Vec<char> = ruby.chars().collect();

    // 漢字が含まれていない場合はそのまま通常ルビ
    if !s_chars.iter().any(|&c| is_kanji(c)) || s_chars.is_empty() || r_chars.is_empty() {
        return format_ruby(surface, ruby);
    }

    // 1. 先頭の一致するひらがなを検出（接頭辞）
    let mut prefix_len = 0;
    while prefix_len < s_chars.len()
        && prefix_len < r_chars.len()
        && is_hiragana(s_chars[prefix_len])
        && s_chars[prefix_len] == r_chars[prefix_len]
    {
        prefix_len += 1;
    }

    // 2. 末尾の一致するひらがなを検出（接尾辞 / 送り仮名）
    let mut s_end = s_chars.len();
    let mut r_end = r_chars.len();
    let mut suffix_chars: Vec<char> = Vec::new();

    while s_end > prefix_len
        && r_end > prefix_len
        && is_hiragana(s_chars[s_end - 1])
        && s_chars[s_end - 1] == r_chars[r_end - 1]
    {
        suffix_chars.push(s_chars[s_end - 1]);
        s_end -= 1;
        r_end -= 1;
    }
    suffix_chars.reverse();

    // 3. ルビ側が既に短縮されている場合（例: surface="見下ろす", ruby="みお"）
    // ルビ全体がひらがなで構成されており、末尾一致がまだ取れていない場合、
    // surface 側の末尾の連続するひらがなを送り仮名として切り離す
    if suffix_chars.is_empty() && r_chars.iter().all(|&c| is_hiragana(c)) {
        let mut temp_s_end = s_end;
        let mut okuri = Vec::new();
        while temp_s_end > prefix_len && is_hiragana(s_chars[temp_s_end - 1]) {
            okuri.push(s_chars[temp_s_end - 1]);
            temp_s_end -= 1;
        }
        // 漢字が残る場合のみ送り仮名として採用
        if temp_s_end > prefix_len && s_chars[prefix_len..temp_s_end].iter().any(|&c| is_kanji(c)) {
            okuri.reverse();
            suffix_chars = okuri;
            s_end = temp_s_end;
        }
    }

    let core_surface: String = s_chars[prefix_len..s_end].iter().collect();
    let core_ruby: String = r_chars[prefix_len..r_end].iter().collect();

    // 漢字コアとルビコアが有効な場合
    if !core_surface.is_empty() && !core_ruby.is_empty() && core_surface.chars().any(is_kanji) {
        let prefix: String = s_chars[..prefix_len].iter().collect();
        let suffix: String = suffix_chars.into_iter().collect();
        format!("{}|{}《{}》{}", prefix, core_surface, core_ruby, suffix)
    } else {
        format_ruby(surface, ruby)
    }
}

/// 小説記法（ルビ・傍点）をHTMLタグに変換
pub fn transform_to_html(text: &str) -> String {
    if text.is_empty() {
        return String::new();
    }

    // 1. パイプありルビ
    let step1 = RE_RUBY_WITH_PIPE.replace_all(text, "<ruby>$1<rt>$2</rt></ruby>");
    // 2. パイプなし漢字ルビ
    let step2 = RE_RUBY_WITHOUT_PIPE.replace_all(&step1, "<ruby>$1<rt>$2</rt></ruby>");
    // 3. 傍点
    let step3 = RE_BOUTEN.replace_all(&step2, r#"<span class="bouten">$1</span>"#);

    step3.into_owned()
}

pub fn is_kanji_char(c: char) -> bool {
    c == '々'
        || c == '〇'
        || ('\u{4E00}'..='\u{9FFF}').contains(&c)
        || ('\u{3400}'..='\u{4DBF}').contains(&c)
        || ('\u{20000}'..='\u{2A6DF}').contains(&c)
}

/// ルビ記法や傍点を除去して親文字のみのテキストを取得
pub fn strip_ruby(text: &str) -> String {
    if text.is_empty() {
        return String::new();
    }
    strip_ruby_with_map(text).clean_text
}

/// ルビ記法や傍点を除去し、各文字の元位置マッピング（行・列）と既存ルビ範囲を構築する
pub fn strip_ruby_with_map(text: &str) -> StrippedResultWithMap {
    if text.is_empty() {
        return StrippedResultWithMap {
            clean_text: String::new(),
            char_map: Vec::new(),
            existing_rubies: Vec::new(),
        };
    }

    let chars: Vec<char> = text.chars().collect();
    let n = chars.len();

    // 1. 各文字の (line, column) を計算
    let mut raw_positions = Vec::with_capacity(n);
    let mut current_line = 1u32;
    let mut current_col = 1u32;
    for &c in &chars {
        raw_positions.push(SourcePosition {
            line: current_line,
            column: current_col,
        });
        if c == '\n' {
            current_line += 1;
            current_col = 1;
        } else {
            current_col += 1;
        }
    }

    let mut clean_chars = Vec::with_capacity(n);
    let mut char_map = Vec::with_capacity(n);
    let mut existing_rubies = Vec::new();

    let mut i = 0;
    while i < n {
        // ① 傍点 《《...》》
        if i + 1 < n && chars[i] == '《' && chars[i + 1] == '《' {
            let mut close_idx = None;
            let mut j = i + 2;
            while j + 1 < n {
                if chars[j] == '\n' {
                    break;
                }
                if chars[j] == '》' && chars[j + 1] == '》' {
                    close_idx = Some(j);
                    break;
                }
                j += 1;
            }

            if let Some(c_idx) = close_idx {
                for k in (i + 2)..c_idx {
                    clean_chars.push(chars[k]);
                    char_map.push(raw_positions[k]);
                }
                i = c_idx + 2;
                continue;
            }
        }

        // ② パイプありルビ [|｜]親文字《ルビ》
        if chars[i] == '|' || chars[i] == '｜' {
            let mut ruby_open = None;
            let mut j = i + 1;
            while j < n {
                let c = chars[j];
                if c == '\n' || c == '|' || c == '｜' {
                    break;
                }
                if c == '《' {
                    if j + 1 < n && chars[j + 1] == '《' {
                        break;
                    }
                    ruby_open = Some(j);
                    break;
                }
                j += 1;
            }

            if let Some(open_idx) = ruby_open {
                if open_idx > i + 1 {
                    let mut ruby_close = None;
                    let mut k = open_idx + 1;
                    while k < n {
                        let c = chars[k];
                        if c == '\n' || c == '《' {
                            break;
                        }
                        if c == '》' {
                            ruby_close = Some(k);
                            break;
                        }
                        k += 1;
                    }

                    if let Some(close_idx) = ruby_close {
                        let parent_start = i + 1;
                        let parent_end = open_idx;
                        let parent_surface: String = chars[parent_start..parent_end].iter().collect();
                        let ruby_text: String = chars[(open_idx + 1)..close_idx].iter().collect();

                        let start_pos = raw_positions[parent_start];
                        let last_pos = raw_positions[parent_end - 1];
                        let end_pos = SourcePosition {
                            line: last_pos.line,
                            column: last_pos.column + 1,
                        };

                        existing_rubies.push(RubyRange {
                            surface: parent_surface,
                            ruby: ruby_text,
                            start: start_pos,
                            end: end_pos,
                        });

                        for idx in parent_start..parent_end {
                            clean_chars.push(chars[idx]);
                            char_map.push(raw_positions[idx]);
                        }

                        i = close_idx + 1;
                        continue;
                    }
                }
            }
        }

        // ③ 漢字ルビ 漢字連続《ルビ》
        if is_kanji_char(chars[i]) {
            let mut kanji_end = i;
            while kanji_end < n && is_kanji_char(chars[kanji_end]) {
                kanji_end += 1;
            }

            if kanji_end < n && chars[kanji_end] == '《' && (kanji_end + 1 >= n || chars[kanji_end + 1] != '《') {
                let mut ruby_close = None;
                let mut k = kanji_end + 1;
                while k < n {
                    let c = chars[k];
                    if c == '\n' || c == '《' {
                        break;
                    }
                    if c == '》' {
                        ruby_close = Some(k);
                        break;
                    }
                    k += 1;
                }

                if let Some(close_idx) = ruby_close {
                    let parent_surface: String = chars[i..kanji_end].iter().collect();
                    let ruby_text: String = chars[(kanji_end + 1)..close_idx].iter().collect();

                    let start_pos = raw_positions[i];
                    let last_pos = raw_positions[kanji_end - 1];
                    let end_pos = SourcePosition {
                        line: last_pos.line,
                        column: last_pos.column + 1,
                    };

                    existing_rubies.push(RubyRange {
                        surface: parent_surface,
                        ruby: ruby_text,
                        start: start_pos,
                        end: end_pos,
                    });

                    for idx in i..kanji_end {
                        clean_chars.push(chars[idx]);
                        char_map.push(raw_positions[idx]);
                    }

                    i = close_idx + 1;
                    continue;
                }
            }
        }

        // ④ 通常文字
        clean_chars.push(chars[i]);
        char_map.push(raw_positions[i]);
        i += 1;
    }

    let clean_text: String = clean_chars.into_iter().collect();

    StrippedResultWithMap {
        clean_text,
        char_map,
        existing_rubies,
    }
}

/// ルビ読みのみをスペース区切りで抽出
pub fn extract_ruby_text(text: &str) -> String {
    if text.is_empty() {
        return String::new();
    }

    let mut results = Vec::new();

    // パイプありを優先抽出し、抽出箇所を一時空白に置換
    let remaining = RE_RUBY_WITH_PIPE.replace_all(text, |caps: &regex::Captures| {
        results.push(caps[2].to_string());
        " "
    });

    for caps in RE_RUBY_WITHOUT_PIPE.captures_iter(&remaining) {
        results.push(caps[2].to_string());
    }

    results.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_ruby() {
        assert_eq!(format_ruby("天霧", "あまぎり"), "|天霧《あまぎり》");
    }

    #[test]
    fn test_format_smart_ruby() {
        // 通常の動詞送り仮名
        assert_eq!(format_smart_ruby("見下ろす", "みおろす"), "|見下《みお》ろす");
        assert_eq!(format_smart_ruby("駆ける", "かける"), "|駆《か》ける");
        assert_eq!(format_smart_ruby("美しい", "うつくしい"), "|美《うつく》しい");

        // 作家がルビ側を漢字部分のみに手入力した場合
        assert_eq!(format_smart_ruby("見下ろす", "みお"), "|見下《みお》ろす");

        // 接頭辞を含む語句
        assert_eq!(format_smart_ruby("お見舞い", "おみまい"), "お|見舞《みま》い");

        // 送り仮名のない熟語
        assert_eq!(format_smart_ruby("天霧", "あまぎり"), "|天霧《あまぎり》");
        assert_eq!(format_smart_ruby("運命", "うんめい"), "|運命《うんめい》");

        // 当て字・特殊ルビ（カタカナ）は全体ルビを維持
        assert_eq!(
            format_smart_ruby("見下ろす", "ルックダウン"),
            "|見下ろす《ルックダウン》"
        );
        assert_eq!(
            format_smart_ruby("本気", "マジ"),
            "|本気《マジ》"
        );
    }

    #[test]
    fn test_transform_to_html() {
        assert_eq!(
            transform_to_html("|親文字《ルビ》"),
            "<ruby>親文字<rt>ルビ</rt></ruby>"
        );
        assert_eq!(
            transform_to_html("｜親文字《ルビ》"),
            "<ruby>親文字<rt>ルビ</rt></ruby>"
        );
        assert_eq!(
            transform_to_html("漢字《かんじ》"),
            "<ruby>漢字<rt>かんじ</rt></ruby>"
        );
        assert_eq!(
            transform_to_html("日々《ひび》、〇〇《まるまる》"),
            "<ruby>日々<rt>ひび</rt></ruby>、<ruby>〇〇<rt>まるまる</rt></ruby>"
        );
        assert_eq!(
            transform_to_html("《《強調》》"),
            r#"<span class="bouten">強調</span>"#
        );
        assert_eq!(
            transform_to_html("|運命《デスティニー》の《《鍵》》を手にした漢字《かんじ》。"),
            r#"<ruby>運命<rt>デスティニー</rt></ruby>の<span class="bouten">鍵</span>を手にした<ruby>漢字<rt>かんじ</rt></ruby>。"#
        );
        assert_eq!(transform_to_html(""), "");
    }

    #[test]
    fn test_strip_ruby() {
        assert_eq!(
            strip_ruby("|親文字《ルビ》と漢字《かんじ》"),
            "親文字と漢字"
        );
        assert_eq!(
            strip_ruby("《《強調》》されたテキスト"),
            "強調されたテキスト"
        );
    }

    #[test]
    fn test_extract_ruby_text() {
        assert_eq!(
            extract_ruby_text("|親文字《ルビ》と漢字《かんじ》"),
            "ルビ かんじ"
        );
        assert_eq!(extract_ruby_text("ルビのないテキスト"), "");
    }

    #[test]
    fn test_strip_ruby_with_map() {
        let text = "|東京《とうきょう》特許許可局\n漢字《かんじ》と《《傍点》》";
        let res = strip_ruby_with_map(text);

        assert_eq!(res.clean_text, "東京特許許可局\n漢字と傍点");
        assert_eq!(res.clean_text.chars().count(), res.char_map.len());

        // 1行目: |東京《とうきょう》特許許可局
        // '東': 元行 1, 元列 2 (| の次)
        assert_eq!(res.char_map[0], SourcePosition { line: 1, column: 2 });
        // '京': 元行 1, 元列 3
        assert_eq!(res.char_map[1], SourcePosition { line: 1, column: 3 });
        // '特': 元行 1, 元列 11 (》 の次)
        assert_eq!(res.char_map[2], SourcePosition { line: 1, column: 11 });

        // 既存ルビ範囲の検証
        assert_eq!(res.existing_rubies.len(), 2);
        assert_eq!(res.existing_rubies[0].surface, "東京");
        assert_eq!(res.existing_rubies[0].ruby, "とうきょう");
        assert_eq!(res.existing_rubies[0].start, SourcePosition { line: 1, column: 2 });
        assert_eq!(res.existing_rubies[0].end, SourcePosition { line: 1, column: 4 });

        // 2行目の漢字ルビ: 漢字《かんじ》
        assert_eq!(res.existing_rubies[1].surface, "漢字");
        assert_eq!(res.existing_rubies[1].ruby, "かんじ");
        assert_eq!(res.existing_rubies[1].start, SourcePosition { line: 2, column: 1 });
        assert_eq!(res.existing_rubies[1].end, SourcePosition { line: 2, column: 3 });
    }
}

