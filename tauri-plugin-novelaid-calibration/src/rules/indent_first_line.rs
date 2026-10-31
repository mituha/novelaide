use crate::models::{CalibrationIssue, CalibrationRange};
use crate::rules::brackets::is_opening_bracket as brackets_is_opening_bracket;
use crate::rules::context::CalibrationContext;
use crate::rules::CalibrationRule;

/// 開き括弧文字かどうかを判定（共通括弧モジュールへの委譲・再エクスポート）
pub fn is_opening_bracket(c: char) -> bool {
    brackets_is_opening_bracket(c)
}

/// ダッシュ文字かどうかを判定（全角ダッシュ U+2015, EMダッシュ U+2014, 罫線 U+2500）
fn is_dash_char(c: char) -> bool {
    matches!(c, '―' | '—' | '─')
}

/// 地の文の通常の語頭文字（ひらがな、カタカナ、漢字、英数字）かどうかを判定
fn is_natural_text_char(c: char) -> bool {
    matches!(
        c,
        '\u{3040}'..='\u{309F}' // ひらがな
        | '\u{30A0}'..='\u{30FF}' // カタカナ
        | '\u{4E00}'..='\u{9FFF}' // CJK統合漢字
        | '\u{3400}'..='\u{4DBF}' // CJK拡張A漢字
    ) || c.is_alphanumeric()
}

/// 1文字の記号アイコン＋開き括弧で始まっているかを判定（例: `❤〚`, `◆［`, `▽［` 等）
fn starts_with_icon_and_bracket(line: &str) -> bool {
    let mut chars = line.chars();
    if let (Some(first), Some(second)) = (chars.next(), chars.next()) {
        // 1文字目が通常の文字（ひらがな・カタカナ・漢字・英数字）ではなく、
        // かつ 2文字目が開き括弧である場合
        !is_natural_text_char(first) && is_opening_bracket(second)
    } else {
        false
    }
}

/// 段落冒頭の字下げ（行頭全角空白）ルール
///
/// 小説作法では、会話文（開き括弧で始まる行）以外の地の文の行頭は、
/// 原則として全角1マス空ける（字下げを行う）必要があります。
/// ※ただし、以下の例外行は字下げ免除とします：
/// 1. 空行およびMarkdown見出し行（`# `）
/// 2. ダッシュ記号（`――`）で始まるアナウンス・演出行
/// 3. アイコン記号1文字＋開き括弧（`❤〚`, `◆［`, `▽［` 等）で始まるセリフ行
pub struct IndentFirstLineRule {
    pub default_enabled: bool,
}

impl Default for IndentFirstLineRule {
    fn default() -> Self {
        Self {
            default_enabled: true,
        }
    }
}

impl CalibrationRule for IndentFirstLineRule {
    fn id(&self) -> &'static str {
        "novel-indent-first-line"
    }

    fn name(&self) -> &'static str {
        "段落冒頭の字下げ"
    }

    fn rule_type(&self) -> &'static str {
        "novel_style"
    }

    fn default_enabled(&self) -> bool {
        self.default_enabled
    }

    fn check(&self, ctx: &CalibrationContext) -> Vec<CalibrationIssue> {
        let mut issues = Vec::new();

        for (line_idx, line) in ctx.lines.iter().enumerate() {
            let line_num = (line_idx + 1) as u32;
            let trimmed = line.trim();

            // 空行は字下げ対象外
            if trimmed.is_empty() {
                continue;
            }

            // Markdown見出し行（# ）は章タイトルのため字下げ対象外
            if trimmed.starts_with('#') {
                continue;
            }

            if let Some(first_char) = line.chars().next() {
                // 会話文（開き括弧で始まる）または既に全角空白で始まっている場合は正常
                if is_opening_bracket(first_char) || first_char == '　' {
                    continue;
                }

                // 半角空白で始まっている場合は別ルール（novel-no-half-width-space）で処理されるため除外
                if first_char == ' ' || first_char == '\t' {
                    continue;
                }

                // 行頭がダッシュで始まる演出行は字下げ免除（※3点リーダーは含めない）
                if is_dash_char(first_char) {
                    continue;
                }

                // 1文字の記号アイコン＋開き括弧（例: `❤〚`, `◆［`, `▽［`）で始まる行は字下げ免除
                if starts_with_icon_and_bracket(line) {
                    continue;
                }

                // 地の文で行頭字下げがない場合
                issues.push(CalibrationIssue {
                    id: format!("indent-first-line-{}", line_num),
                    rule_id: self.id().to_string(),
                    rule_type: self.rule_type().to_string(),
                    message: "段落の冒頭（地の文）は原則として全角1マス字下げを行います".into(),
                    range: CalibrationRange {
                        start_line: line_num,
                        start_column: 1,
                        end_line: line_num,
                        end_column: 2,
                    },
                    suggestion: Some(format!("　{}", first_char)),
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
    fn test_indent_first_line_rule() {
        let rule = IndentFirstLineRule::default();
        let lines = vec![
            "吾輩は猫である。",                                                 // 地の文字下げなし -> 指摘
            "　吾輩は猫である。",                                               // 字下げあり -> 正常
            "「名前はまだ無い。」",                                             // 会話文（開き括弧） -> 正常
            "❤〚え、ナギサくん、戻っちゃったよ。大丈夫かな……〛",             // アイコン＋二重亀甲括弧 -> 正常（免除）
            "◆［魔力がおかしいと精霊に影響を与えるわけか］",                   // アイコン＋全角角括弧 -> 正常（免除）
            "▽［それより、ナギサくん帰ったら、浮いてるボスに攻撃届くのか？］", // アイコン＋全角角括弧 -> 正常（免除）
            "――　ダンジョンボスとの戦闘を開始します。",                       // ダッシュ演出行 -> 正常（免除）
            "　　　なお、この戦闘はレイド可能となっています。",                 // 全角字下げ複数マス -> 正常
            "# 第一章 旅立ち",                                                 // 見出し -> 正常
            "……誰もいなかった。",                                             // 3点リーダーは免除対象外 -> 指摘
            "|彼女《かのじょ》の瞳。",                                          // ルビ付き地の文 -> 指摘
        ];
        let ctx = CalibrationContext {
            text: "",
            lines: &lines,
            tokens: &[],
        };

        let issues = rule.check(&ctx);
        assert_eq!(issues.len(), 3);

        // 指摘1: 吾輩は猫である。（行1）
        assert_eq!(issues[0].range.start_line, 1);
        assert_eq!(issues[0].suggestion, Some("　吾".into()));

        // 指摘2: ……誰もいなかった。（行10）
        assert_eq!(issues[1].range.start_line, 10);
        assert_eq!(issues[1].suggestion, Some("　…".into()));

        // 指摘3: |彼女《かのじょ》の瞳。（行11）
        assert_eq!(issues[2].range.start_line, 11);
        assert_eq!(issues[2].suggestion, Some("　|".into()));
    }
}
