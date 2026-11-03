use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use crate::models::NovelaidDocumentType;

/// 1つのマッピング規則
#[derive(Debug, Clone)]
pub struct AttributeRule {
    pub pattern: String,
    pub target_type: NovelaidDocumentType,
    pub is_directory_pattern: bool,
    pub is_self_pattern: bool,
}

#[derive(Debug, Clone)]
struct CacheEntry {
    mtime: SystemTime,
    rules: Vec<AttributeRule>,
}

/// .novelaidattributes のパース、キャッシュ、タイプ照合を担う管理クラス
#[derive(Debug)]
pub struct AttributesManager {
    cache: Mutex<HashMap<PathBuf, CacheEntry>>,
}

impl AttributesManager {
    pub fn new() -> Self {
        Self {
            cache: Mutex::new(HashMap::new()),
        }
    }

    /// キャッシュ全体をクリア（プロジェクト切り替え時等）
    pub fn clear(&self) {
        let mut cache = self.cache.lock().unwrap();
        cache.clear();
    }

    /// 特定ディレクトリのキャッシュを破棄
    pub fn invalidate_dir(&self, dir_path: &Path) {
        let mut cache = self.cache.lock().unwrap();
        cache.remove(dir_path);
    }

    /// 操作対象が .novelaidattributes の場合、親ディレクトリのキャッシュを破棄
    pub fn invalidate_if_attributes_file(&self, file_path: &Path) {
        if let Some(file_name) = file_path.file_name().and_then(|n| n.to_str()) {
            if file_name == ".novelaidattributes" {
                if let Some(parent) = file_path.parent() {
                    self.invalidate_dir(parent);
                }
            }
        }
    }

    /// 指定ディレクトリ直下の .novelaidattributes を読み込み、キャッシュしてルール一覧を返す
    pub fn get_rules_for_dir(&self, dir_path: &Path) -> Option<Vec<AttributeRule>> {
        let attr_path = dir_path.join(".novelaidattributes");
        let metadata = fs::metadata(&attr_path).ok()?;
        let mtime = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);

        {
            let cache = self.cache.lock().unwrap();
            if let Some(entry) = cache.get(dir_path) {
                if entry.mtime == mtime {
                    return Some(entry.rules.clone());
                }
            }
        }

        let content = fs::read_to_string(&attr_path).ok()?;
        let mut rules = Vec::new();

        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                continue;
            }

            let mut parts = trimmed.split_whitespace();
            if let (Some(pattern), Some(type_str)) = (parts.next(), parts.next()) {
                if let Some(doc_type) = NovelaidDocumentType::from_name(type_str) {
                    let is_self_pattern = pattern == "./";
                    let is_directory_pattern = is_self_pattern || pattern.ends_with('/');
                    rules.push(AttributeRule {
                        pattern: pattern.to_string(),
                        target_type: doc_type,
                        is_directory_pattern,
                        is_self_pattern,
                    });
                }
            }
        }

        let mut cache = self.cache.lock().unwrap();
        cache.insert(
            dir_path.to_path_buf(),
            CacheEntry {
                mtime,
                rules: rules.clone(),
            },
        );

        Some(rules)
    }

    /// ファイルパスからドキュメントタイプを判定
    pub fn get_document_type(&self, file_path: &Path) -> NovelaidDocumentType {
        let file_name = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default();

        // 1. 親ディレクトリの .novelaidattributes ルールを最優先照合（全ファイル名対象）
        if let Some(parent) = file_path.parent() {
            if let Some(rules) = self.get_rules_for_dir(parent) {
                for rule in &rules {
                    if !rule.is_directory_pattern && matches_pattern(&rule.pattern, file_name) {
                        return rule.target_type;
                    }
                }
            }
        }

        let lower_name = file_name.to_lowercase();

        // 2. ドットファイル（拡張子のない設定・エディタ関連ファイル）
        if lower_name == ".gitignore"
            || lower_name == ".gitattributes"
            || lower_name == ".novelaidattributes"
            || lower_name == ".editorconfig"
            || lower_name == ".prettierrc"
            || lower_name == ".eslintrc"
            || lower_name == ".npmrc"
            || lower_name.starts_with(".env")
        {
            return NovelaidDocumentType::Code;
        }

        // 3. 拡張子による標準判定
        let ext = file_path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default();

        match ext.as_str() {
            "txt" => NovelaidDocumentType::Novel,
            "md" | "markdown" => NovelaidDocumentType::Markdown,
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "tiff" | "ico" => {
                NovelaidDocumentType::Image
            }
            "chat" | "ch" => NovelaidDocumentType::Chat,
            "css" | "scss" | "less" | "json" | "yaml" | "yml" | "toml" | "js" | "mjs" | "cjs"
            | "ts" | "tsx" | "jsx" | "html" | "xml" | "sh" | "bash" | "bat" | "cmd" | "ps1"
            | "sql" | "ini" | "conf" | "properties" => NovelaidDocumentType::Code,
            _ => NovelaidDocumentType::Unknown,
        }
    }

    /// ディレクトリパスから推奨ドキュメントタイプを判定
    pub fn get_directory_type(
        &self,
        dir_path: &Path,
        parent_type: Option<NovelaidDocumentType>,
    ) -> NovelaidDocumentType {
        let dir_name = dir_path
            .file_name()
            .and_then(|s| s.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default();

        // 1. 自身の直下にある .novelaidattributes の `./` 指定をチェック（最優先）
        if let Some(own_rules) = self.get_rules_for_dir(dir_path) {
            for rule in &own_rules {
                if rule.is_self_pattern {
                    return rule.target_type;
                }
            }
        }

        // 2. 親ディレクトリの .novelaidattributes の `フォルダ名/` 指定をチェック
        if let Some(parent) = dir_path.parent() {
            if let Some(parent_rules) = self.get_rules_for_dir(parent) {
                let dir_slash = format!("{}/", dir_name);
                for rule in &parent_rules {
                    if rule.is_directory_pattern && !rule.is_self_pattern {
                        if matches_pattern(&rule.pattern, &dir_slash) {
                            return rule.target_type;
                        }
                    }
                }
            }
        }

        // 3. フォルダ名キーワード判定
        if dir_name.contains("小説") || dir_name.contains("novel") {
            return NovelaidDocumentType::Novel;
        }
        if dir_name.contains("設定")
            || dir_name.contains("プロット")
            || dir_name.contains("資料")
            || dir_name.contains("wiki")
            || dir_name.contains("markdown")
        {
            return NovelaidDocumentType::Markdown;
        }
        if dir_name.contains("画像") || dir_name.contains("image") {
            return NovelaidDocumentType::Image;
        }
        if dir_name.contains("チャット")
            || dir_name.contains("chat")
            || dir_name.contains("channel")
            || dir_name.contains("チャンネル")
        {
            return NovelaidDocumentType::Chat;
        }

        // 4. 親フォルダ継承
        if let Some(pt) = parent_type {
            return pt;
        }

        // 5. 最終デフォルト
        NovelaidDocumentType::Novel
    }
}

/// ワイルドカード照合（* と ? に対応、大文字小文字不問）
pub fn matches_pattern(pattern: &str, target: &str) -> bool {
    let p: Vec<char> = pattern.to_lowercase().chars().collect();
    let t: Vec<char> = target.to_lowercase().chars().collect();

    let mut pi = 0;
    let mut ti = 0;
    let mut star_idx = None;
    let mut match_idx = 0;

    while ti < t.len() {
        if pi < p.len() && (p[pi] == '?' || p[pi] == t[ti]) {
            pi += 1;
            ti += 1;
        } else if pi < p.len() && p[pi] == '*' {
            star_idx = Some(pi);
            match_idx = ti;
            pi += 1;
        } else if let Some(si) = star_idx {
            pi = si + 1;
            match_idx += 1;
            ti = match_idx;
        } else {
            return false;
        }
    }

    while pi < p.len() && p[pi] == '*' {
        pi += 1;
    }

    pi == p.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_matches_pattern() {
        assert!(matches_pattern("*.md", "test.md"));
        assert!(matches_pattern("*.md", "TEST.MD"));
        assert!(matches_pattern("*.md", "sub.dir.md"));
        assert!(!matches_pattern("*.md", "test.txt"));

        assert!(matches_pattern("第*.md", "第01話.md"));
        assert!(matches_pattern("第*.md", "第1話_旅立ち.md"));
        assert!(!matches_pattern("第*.md", "設定.md"));

        assert!(matches_pattern("novel*/", "novels/"));
        assert!(matches_pattern("novel*/", "NOVEL_DATA/"));
        assert!(!matches_pattern("novel*/", "wiki/"));

        assert!(matches_pattern("?.txt", "a.txt"));
        assert!(!matches_pattern("?.txt", "ab.txt"));
    }
}
