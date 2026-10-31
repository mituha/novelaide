use regex::Regex;
use std::sync::LazyLock;

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

/// ルビ記法や傍点を除去して親文字のみのテキストを取得
pub fn strip_ruby(text: &str) -> String {
    if text.is_empty() {
        return String::new();
    }

    let step1 = RE_RUBY_WITH_PIPE.replace_all(text, "$1");
    let step2 = RE_RUBY_WITHOUT_PIPE.replace_all(&step1, "$1");
    let step3 = RE_BOUTEN.replace_all(&step2, "$1");

    step3.into_owned()
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
}

