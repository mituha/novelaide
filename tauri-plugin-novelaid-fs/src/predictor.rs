use crate::models::NovelaidDocumentType;
use std::collections::HashSet;

/// 全角・半角数字の判定および相互変換
fn is_digit(c: char) -> bool {
    c.is_ascii_digit() || ('０'..='９').contains(&c)
}

fn is_fullwidth_digit(c: char) -> bool {
    ('０'..='９').contains(&c)
}

fn digit_value(c: char) -> u32 {
    if c.is_ascii_digit() {
        (c as u32) - ('0' as u32)
    } else {
        (c as u32) - ('０' as u32)
    }
}

fn format_number(val: i64, padding: usize, fullwidth: bool) -> String {
    let s = if val < 0 {
        format!("-{}", val.abs())
    } else {
        format!("{:0width$}", val, width = padding)
    };

    if !fullwidth {
        return s;
    }

    s.chars()
        .map(|c| {
            if c.is_ascii_digit() {
                char::from_u32('０' as u32 + (c as u32 - '0' as u32)).unwrap()
            } else {
                c
            }
        })
        .collect()
}

/// 文字列内の数値ブロック情報
#[derive(Debug, Clone, PartialEq)]
struct NumberSegment {
    prefix: String,
    value: i64,
    suffix: String,
    padding: usize,
    fullwidth: bool,
}

impl NumberSegment {
    /// 文字列から数値ブロック（末尾の数値、あるいは唯一の数値）を抽出
    fn parse(s: &str) -> Option<Self> {
        let chars: Vec<char> = s.chars().collect();
        let len = chars.len();

        // 後ろから数字ブロックを探す（ファイル末尾の番号や、第X話の数値を優先）
        let mut digit_end = None;
        let mut digit_start = None;

        for i in (0..len).rev() {
            if is_digit(chars[i]) {
                if digit_end.is_none() {
                    digit_end = Some(i + 1);
                }
                digit_start = Some(i);
            } else if digit_end.is_some() {
                break;
            }
        }

        let start = digit_start?;
        let end = digit_end?;

        let prefix: String = chars[0..start].iter().collect();
        let suffix: String = chars[end..len].iter().collect();
        let digit_chars = &chars[start..end];

        let mut val: i64 = 0;
        let mut is_fw = false;
        for &c in digit_chars {
            if is_fullwidth_digit(c) {
                is_fw = true;
            }
            val = val * 10 + digit_value(c) as i64;
        }

        Some(NumberSegment {
            prefix,
            value: val,
            suffix,
            padding: digit_chars.len(),
            fullwidth: is_fw,
        })
    }

    fn render(&self, next_val: i64) -> String {
        format!(
            "{}{}{}",
            self.prefix,
            format_number(next_val, self.padding, self.fullwidth),
            self.suffix
        )
    }
}

/// 2つのパートから次のパート文字列を推測
fn predict_next_part(part1: &str, part2: &str) -> String {
    let seg1 = NumberSegment::parse(part1);
    let seg2 = NumberSegment::parse(part2);

    match (seg1, seg2) {
        (Some(s1), Some(s2)) => {
            if s1.prefix == s2.prefix && s1.suffix == s2.suffix {
                let step = s2.value - s1.value;
                let next_val = s2.value + if step != 0 { step } else { 1 };
                s2.render(next_val)
            } else {
                // 接頭辞や接尾辞が変わっている場合はpart2ベースでインクリメント
                let step = if s2.value % 10 == 0 && s2.value > 0 { 10 } else { 1 };
                s2.render(s2.value + step)
            }
        }
        (None, Some(s2)) => {
            let step = if s2.value % 10 == 0 && s2.value > 0 { 10 } else { 1 };
            s2.render(s2.value + step)
        }
        _ => part2.to_string(),
    }
}

/// 1つのパートから次のパート文字列を推測（1ファイルのみ存在時）
fn increment_single_part(part: &str) -> String {
    if let Some(s) = NumberSegment::parse(part) {
        // 下1桁が0（0110や0010等）の場合はステップ10を推測、それ以外は1
        let step = if s.value % 10 == 0 && s.value > 0 { 10 } else { 1 };
        s.render(s.value + step)
    } else {
        part.to_string()
    }
}

/// ベース名（拡張子なし）から次のベース名を推測
fn predict_next_basename(prev1: Option<&str>, prev2: &str) -> String {
    let parts2: Vec<&str> = prev2.split('_').collect();

    if let Some(p1) = prev1 {
        let parts1: Vec<&str> = p1.split('_').collect();
        if parts1.len() == parts2.len() {
            let mut next_parts = Vec::new();
            for (p_a, p_b) in parts1.iter().zip(parts2.iter()) {
                next_parts.push(predict_next_part(p_a, p_b));
            }
            return next_parts.join("_");
        }
    }

    // parts1 がない、または parts数が一致しない場合は prev2 をベースに推測
    let next_parts: Vec<String> = parts2.iter().map(|p| increment_single_part(p)).collect();
    next_parts.join("_")
}

/// 自然順（数値考慮）で文字列を比較する
fn natural_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();

    let mut i = 0;
    let mut j = 0;

    while i < a_chars.len() && j < b_chars.len() {
        if is_digit(a_chars[i]) && is_digit(b_chars[j]) {
            let mut num_a: i64 = 0;
            let mut num_b: i64 = 0;
            while i < a_chars.len() && is_digit(a_chars[i]) {
                num_a = num_a * 10 + digit_value(a_chars[i]) as i64;
                i += 1;
            }
            while j < b_chars.len() && is_digit(b_chars[j]) {
                num_b = num_b * 10 + digit_value(b_chars[j]) as i64;
                j += 1;
            }
            if num_a != num_b {
                return num_a.cmp(&num_b);
            }
        } else {
            let ca = a_chars[i].to_lowercase().next().unwrap_or(a_chars[i]);
            let cb = b_chars[j].to_lowercase().next().unwrap_or(b_chars[j]);
            if ca != cb {
                return ca.cmp(&cb);
            }
            i += 1;
            j += 1;
        }
    }

    a_chars.len().cmp(&b_chars.len())
}

/// ディレクトリ内の既存ファイル名一覧から次の新規ファイル名を推測して生成
pub fn predict_next_file_name(
    existing_files: &[String],
    folder_name: &str,
    doc_type: NovelaidDocumentType,
) -> String {
    let existing_set: HashSet<&str> = existing_files.iter().map(|s| s.as_str()).collect();

    // デフォルト拡張子の決定
    let target_ext = match doc_type {
        NovelaidDocumentType::Novel => "txt",
        NovelaidDocumentType::Markdown => "md",
        _ => "txt",
    };

    // 対象拡張子を持つファイルを抽出し、自然順ソート
    let mut matching_files: Vec<&str> = existing_files
        .iter()
        .filter_map(|name| {
            let path = std::path::Path::new(name);
            let ext = path.extension()?.to_string_lossy().to_lowercase();
            if ext == target_ext || (target_ext == "txt" && ext == "md") {
                Some(name.as_str())
            } else {
                None
            }
        })
        .collect();

    matching_files.sort_by(|a, b| natural_cmp(a, b));

    let mut candidate = if matching_files.is_empty() {
        // 既存ファイルが0件の場合
        match doc_type {
            NovelaidDocumentType::Novel => format!("0010_第1話.{}", target_ext),
            NovelaidDocumentType::Markdown => {
                if folder_name.contains("設定") {
                    "01_設定.md".to_string()
                } else if folder_name.contains("プロット") || folder_name.to_lowercase().contains("plot") {
                    "01_プロット.md".to_string()
                } else {
                    "01_資料.md".to_string()
                }
            }
            _ => format!("新規ドキュメント.{}", target_ext),
        }
    } else {
        let last_file = matching_files[matching_files.len() - 1];
        let last_path = std::path::Path::new(last_file);
        let ext = last_path.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_else(|| target_ext.to_string());
        let last_stem = last_path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();

        let prev_stem = if matching_files.len() >= 2 {
            let p = std::path::Path::new(matching_files[matching_files.len() - 2]);
            p.file_stem().map(|s| s.to_string_lossy().to_string())
        } else {
            None
        };

        let next_stem = predict_next_basename(prev_stem.as_deref(), &last_stem);
        format!("{}.{}", next_stem, ext)
    };

    // 重複チェック: もし既に存在するなら末尾インクリメントで空きを探す
    let mut safety_counter = 0;
    while existing_set.contains(candidate.as_str()) && safety_counter < 1000 {
        safety_counter += 1;
        let path = std::path::Path::new(&candidate);
        let ext = path.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_else(|| target_ext.to_string());
        let stem = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();

        let next_stem = increment_single_part(&stem);
        if next_stem == stem {
            // 数値が含まれずインクリメントできない場合は (2) を付加
            candidate = format!("{}({}).{}", stem, safety_counter + 1, ext);
        } else {
            candidate = format!("{}.{}", next_stem, ext);
        }
    }

    candidate
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_pattern_inference() {
        // ユーザー提示の例:
        // 0110_第11話_xxx１.txt
        // 0120_第12話_xxx２.txt
        // -> 0130_第13話_xxx３.txt
        let files = vec![
            "0110_第11話_xxx１.txt".to_string(),
            "0120_第12話_xxx２.txt".to_string(),
        ];
        let next = predict_next_file_name(&files, "novel", NovelaidDocumentType::Novel);
        assert_eq!(next, "0130_第13話_xxx３.txt");
    }

    #[test]
    fn test_single_file_inference() {
        let files = vec!["0010_第1話.txt".to_string()];
        let next = predict_next_file_name(&files, "novel", NovelaidDocumentType::Novel);
        assert_eq!(next, "0020_第2話.txt");
    }

    #[test]
    fn test_empty_folder_inference() {
        let files: Vec<String> = vec![];
        let next_novel = predict_next_file_name(&files, "小説", NovelaidDocumentType::Novel);
        assert_eq!(next_novel, "0010_第1話.txt");

        let next_plot = predict_next_file_name(&files, "プロット", NovelaidDocumentType::Markdown);
        assert_eq!(next_plot, "01_プロット.md");
    }

    #[test]
    fn test_collision_avoidance() {
        let files = vec![
            "01_第1話.txt".to_string(),
            "02_第2話.txt".to_string(),
            "03_第3話.txt".to_string(), // 次の候補がすでに存在する場合
        ];
        // 最後の2件は 02_第2話 と 03_第3話 なので次は 04_第4話 になる
        let next = predict_next_file_name(&files, "novel", NovelaidDocumentType::Novel);
        assert_eq!(next, "04_第4話.txt");
    }
}
