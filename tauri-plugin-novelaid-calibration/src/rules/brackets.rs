/// 開き括弧と閉じ括弧のペア定義（順序付き対）
///
/// 各種括弧の判定、閉じ括弧自動補完、整合性チェック等で一元的に再利用されます。
pub const BRACKET_PAIRS: &[(char, char)] = &[
    ('「', '」'), // かぎ括弧
    ('『', '』'), // 二重かぎ括弧
    ('（', '）'), // 全角丸括弧
    ('(', ')'),   // 半角丸括弧
    ('【', '】'), // 隅付き括弧
    ('｛', '｝'), // 全角波括弧
    ('{', '}'),   // 半角波括弧
    ('［', '］'), // 全角角括弧
    ('[', ']'),   // 半角角括弧
    ('〈', '〉'), // 山括弧
    ('《', '》'), // 二重山括弧（ルビ等）
    ('〔', '〕'), // 亀甲括弧
    ('‘', '’'),   // 全角シングルクォート（カーリー）
    ('“', '”'),   // 全角ダブルクォート（カーリー）
];

/// 開きと閉じが同一記号となる対称引用符
///
/// 通常の対括弧とは異なり、ネスト構造を持たず反転判定ができないため分離して管理します。
pub const SYMMETRIC_QUOTES: &[char] = &[
    '`',  // バッククォート（コード用）
    '"',  // 半角二重引用符
    '\'', // 半角単一引用符
];

/// 指定した文字が開き括弧かどうかを判定
pub fn is_opening_bracket(c: char) -> bool {
    BRACKET_PAIRS.iter().any(|&(open, _)| open == c)
}

/// 指定した文字が閉じ括弧かどうかを判定
pub fn is_closing_bracket(c: char) -> bool {
    BRACKET_PAIRS.iter().any(|&(_, close)| close == c)
}

/// 指定した文字が開閉いずれかの括弧かどうかを判定
pub fn is_bracket(c: char) -> bool {
    is_opening_bracket(c) || is_closing_bracket(c)
}

/// 指定した文字が対称引用符かどうかを判定
pub fn is_symmetric_quote(c: char) -> bool {
    SYMMETRIC_QUOTES.contains(&c)
}

/// 開き括弧に対応する閉じ括弧を取得（補完機能などで利用）
pub fn get_matching_closing_bracket(open: char) -> Option<char> {
    BRACKET_PAIRS.iter().find(|&&(o, _)| o == open).map(|&(_, c)| c)
}

/// 閉じ括弧に対応する開き括弧を取得
pub fn get_matching_opening_bracket(close: char) -> Option<char> {
    BRACKET_PAIRS.iter().find(|&&(_, c)| c == close).map(|&(o, _)| o)
}

/// 2つの文字が正しい開閉括弧のペアになっているかを判定
pub fn is_matching_pair(open: char, close: char) -> bool {
    BRACKET_PAIRS.iter().any(|&(o, c)| o == open && c == close)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bracket_pairs_consistency() {
        for &(open, close) in BRACKET_PAIRS {
            assert!(is_opening_bracket(open), "open should be recognized: {}", open);
            assert!(is_closing_bracket(close), "close should be recognized: {}", close);
            assert_eq!(get_matching_closing_bracket(open), Some(close));
            assert_eq!(get_matching_opening_bracket(close), Some(open));
            assert!(is_matching_pair(open, close));
            assert!(!is_matching_pair(close, open));
        }

        assert!(!is_opening_bracket('あ'));
        assert!(!is_closing_bracket('あ'));
        assert_eq!(get_matching_closing_bracket('あ'), None);
    }

    #[test]
    fn test_symmetric_quotes() {
        assert!(is_symmetric_quote('"'));
        assert!(is_symmetric_quote('\''));
        assert!(is_symmetric_quote('`'));
        assert!(!is_symmetric_quote('「'));
    }
}
