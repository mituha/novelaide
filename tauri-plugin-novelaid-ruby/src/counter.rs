use crate::formatter::strip_ruby;
use crate::models::{CountOptions, DetailedCountResult, SpaceBreakdown, TextSegmentMetrics};
use regex::Regex;
use std::sync::LazyLock;

static RE_DIALOGUE_LINE_START: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*[「『]").expect("invalid regex for dialogue line start")
});

static RE_WHITESPACE_AND_NEWLINE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[\s\u{3000}]+").expect("invalid regex for whitespace")
});

fn strip_whitespace(text: &str) -> String {
    RE_WHITESPACE_AND_NEWLINE.replace_all(text, "").into_owned()
}

pub fn count_characters(text: &str, options: CountOptions) -> DetailedCountResult {
    if text.is_empty() {
        return DetailedCountResult {
            raw_length: 0,
            char_count: 0,
            char_count_with_spaces: 0,
            line_count: 0,
            spaces: SpaceBreakdown {
                half_width: 0,
                full_width: 0,
                total: 0,
            },
            newlines: 0,
            dialogue: TextSegmentMetrics {
                char_count: 0,
                char_count_with_spaces: 0,
                line_count: 0,
            },
            narrative: TextSegmentMetrics {
                char_count: 0,
                char_count_with_spaces: 0,
                line_count: 0,
            },
            manuscript_sheets: 0.0,
        };
    }

    let chars_per_line = options.manuscript_chars_per_line.unwrap_or(20);
    let lines_per_sheet = options.manuscript_lines_per_sheet.unwrap_or(20);

    let raw_length = text.chars().count();
    let normalized_text = text.replace("\r\n", "\n");

    let half_width_spaces = normalized_text.chars().filter(|&c| c == ' ').count();
    let full_width_spaces = normalized_text.chars().filter(|&c| c == '\u{3000}').count();
    let newlines = normalized_text.chars().filter(|&c| c == '\n').count();

    let text_without_ruby = strip_ruby(&normalized_text);

    let original_lines: Vec<&str> = normalized_text.split('\n').collect();
    let ruby_stripped_lines: Vec<&str> = text_without_ruby.split('\n').collect();

    let mut dialogue_chars = 0;
    let mut dialogue_chars_with_spaces = 0;
    let mut dialogue_lines = 0;
    let mut narrative_chars = 0;
    let mut narrative_chars_with_spaces = 0;
    let mut narrative_lines = 0;

    for (index, line) in original_lines.iter().enumerate() {
        let is_dialogue_line = RE_DIALOGUE_LINE_START.is_match(line);
        let stripped_line = ruby_stripped_lines.get(index).copied().unwrap_or("");
        let clean_line = strip_whitespace(stripped_line);
        let line_chars_with_spaces = stripped_line.chars().count();

        if is_dialogue_line {
            dialogue_chars += clean_line.chars().count();
            dialogue_chars_with_spaces += line_chars_with_spaces;
            dialogue_lines += 1;
        } else {
            narrative_chars += clean_line.chars().count();
            narrative_chars_with_spaces += line_chars_with_spaces;
            narrative_lines += 1;
        }
    }

    // 改行コード自体の数をセリフ/地の文の「空白・改行含む」カウントに分配
    for (index, line) in original_lines.iter().enumerate() {
        if index < original_lines.len() - 1 {
            let is_dialogue_line = RE_DIALOGUE_LINE_START.is_match(line);
            if is_dialogue_line {
                dialogue_chars_with_spaces += 1;
            } else {
                narrative_chars_with_spaces += 1;
            }
        }
    }

    let char_count = strip_whitespace(&text_without_ruby).chars().count();
    let char_count_with_spaces = text_without_ruby.chars().count();

    let mut total_lines_consumed = 0;
    for line in &ruby_stripped_lines {
        let line_len = line.chars().count();
        total_lines_consumed += if line_len == 0 {
            1
        } else {
            (line_len + chars_per_line - 1) / chars_per_line
        };
    }
    let manuscript_sheets = total_lines_consumed as f64 / lines_per_sheet as f64;

    DetailedCountResult {
        raw_length,
        char_count,
        char_count_with_spaces,
        line_count: original_lines.len(),
        spaces: SpaceBreakdown {
            half_width: half_width_spaces,
            full_width: full_width_spaces,
            total: half_width_spaces + full_width_spaces,
        },
        newlines,
        dialogue: TextSegmentMetrics {
            char_count: dialogue_chars,
            char_count_with_spaces: dialogue_chars_with_spaces,
            line_count: dialogue_lines,
        },
        narrative: TextSegmentMetrics {
            char_count: narrative_chars,
            char_count_with_spaces: narrative_chars_with_spaces,
            line_count: narrative_lines,
        },
        manuscript_sheets,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_count_empty() {
        let result = count_characters("", CountOptions::default());
        assert_eq!(result.raw_length, 0);
        assert_eq!(result.char_count, 0);
        assert_eq!(result.char_count_with_spaces, 0);
        assert_eq!(result.line_count, 0);
        assert_eq!(result.spaces.total, 0);
        assert_eq!(result.newlines, 0);
        assert_eq!(result.dialogue.char_count, 0);
        assert_eq!(result.narrative.char_count, 0);
        assert_eq!(result.manuscript_sheets, 0.0);
    }

    #[test]
    fn test_count_simple() {
        let result = count_characters("あいうえおか", CountOptions::default());
        assert_eq!(result.raw_length, 6);
        assert_eq!(result.char_count, 6);
        assert_eq!(result.char_count_with_spaces, 6);
        assert_eq!(result.line_count, 1);
        assert_eq!(result.spaces.total, 0);
        assert_eq!(result.newlines, 0);
        assert_eq!(result.narrative.char_count, 6);
        assert_eq!(result.narrative.line_count, 1);
        assert_eq!(result.dialogue.char_count, 0);
        assert_eq!(result.dialogue.line_count, 0);
    }

    #[test]
    fn test_exclude_ruby() {
        let input = "|親文字《ルビ》漢字《かんじ》《《強調》》";
        let result = count_characters(input, CountOptions::default());
        assert_eq!(result.char_count, 7);
        assert_eq!(result.char_count_with_spaces, 7);
        assert_eq!(result.raw_length, input.chars().count());
    }

    #[test]
    fn test_distinguish_spaces_and_newlines() {
        let input = "あいう えお\nかきく\u{3000}けこ";
        let result = count_characters(input, CountOptions::default());
        assert_eq!(result.char_count, 10);
        assert_eq!(result.char_count_with_spaces, 13);
        assert_eq!(result.spaces.half_width, 1);
        assert_eq!(result.spaces.full_width, 1);
        assert_eq!(result.spaces.total, 2);
        assert_eq!(result.newlines, 1);
    }

    #[test]
    fn test_dialogue_and_narrative() {
        let input = "地の文です。\n「セリフです」\n『二重セリフです』";
        let result = count_characters(input, CountOptions::default());
        assert_eq!(result.line_count, 3);
        assert_eq!(result.narrative.line_count, 1);
        assert_eq!(result.dialogue.line_count, 2);
    }
}

