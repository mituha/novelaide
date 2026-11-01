use crate::models::{ProjectRubyEntry, RubyOccurrence};
use regex::Regex;
use std::collections::HashMap;
use std::sync::OnceLock;

static RUBY_REGEX: OnceLock<Regex> = OnceLock::new();

fn get_ruby_regex() -> &'static Regex {
    RUBY_REGEX.get_or_init(|| {
        // 1. パイプあり: |親文字《ルビ》 または ｜親文字《ルビ》
        // 2. 漢字ルビ: 漢字《ルビ》 (ただし直前が《ではないこと)
        Regex::new(r"(?:[|｜]([^|｜\n《》]+)《([^《》\n]+)》|([々〇\x{4e00}-\x{9fcf}\x{3400}-\x{4dbf}]+)《([^《》\n]+)》)").unwrap()
    })
}

/// 単一テキストからルビ出現を収集
pub fn extract_rubies_from_text(text: &str, _file_path: &str) -> Vec<(String, String)> {
    let re = get_ruby_regex();
    let mut results = Vec::new();

    for cap in re.captures_iter(text) {
        if let (Some(surface), Some(ruby)) = (cap.get(1), cap.get(2)) {
            // パイプありルビ
            results.push((surface.as_str().trim().to_string(), ruby.as_str().trim().to_string()));
        } else if let (Some(surface), Some(ruby)) = (cap.get(3), cap.get(4)) {
            // 漢字ルビ（傍点 《《...》》 を除外）
            let r_str = ruby.as_str().trim();
            if !r_str.starts_with('《') && !r_str.ends_with('》') {
                results.push((surface.as_str().trim().to_string(), r_str.to_string()));
            }
        }
    }

    results
}

/// 作品固有ルビ辞書ストア
#[derive(Debug, Default, Clone)]
pub struct RubyDictionaryStore {
    /// surface -> HashMap<ruby, count>
    raw_dict: HashMap<String, HashMap<String, (usize, String)>>,
}

impl RubyDictionaryStore {
    pub fn new() -> Self {
        Self {
            raw_dict: HashMap::new(),
        }
    }

    pub fn record_occurrence(&mut self, surface: &str, ruby: &str, file_path: &str) {
        let entry = self.raw_dict.entry(surface.to_string()).or_default();
        let occ = entry.entry(ruby.to_string()).or_insert_with(|| (0, file_path.to_string()));
        occ.0 += 1;
    }

    pub fn build_entries(&self) -> Vec<ProjectRubyEntry> {
        let mut entries = Vec::new();

        for (surface, variants_map) in &self.raw_dict {
            let mut occurrences: Vec<RubyOccurrence> = variants_map
                .iter()
                .map(|(ruby, (count, first_path))| RubyOccurrence {
                    ruby: ruby.clone(),
                    count: *count,
                    first_seen_path: first_path.clone(),
                })
                .collect();

            // 出現回数順にソート（最も多いものを先頭に）
            occurrences.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.ruby.cmp(&b.ruby)));

            let canonical_ruby = occurrences
                .first()
                .map(|o| o.ruby.clone())
                .unwrap_or_default();
            let has_conflict = occurrences.len() > 1;

            entries.push(ProjectRubyEntry {
                surface: surface.clone(),
                canonical_ruby,
                variants: occurrences,
                has_conflict,
            });
        }

        // 親文字順にソート
        entries.sort_by(|a, b| a.surface.cmp(&b.surface));
        entries
    }

    pub fn clear(&mut self) {
        self.raw_dict.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_rubies() {
        let text = "この|魔剣《ソウルイーター》を手にした少年。|運命《デスティニー》と漢字《かんじ》、そして《《強調》》。";
        let pairs = extract_rubies_from_text(text, "test.md");
        assert_eq!(pairs.len(), 3);
        assert_eq!(pairs[0], ("魔剣".to_string(), "ソウルイーター".to_string()));
        assert_eq!(pairs[1], ("運命".to_string(), "デスティニー".to_string()));
        assert_eq!(pairs[2], ("漢字".to_string(), "かんじ".to_string()));
    }
}
