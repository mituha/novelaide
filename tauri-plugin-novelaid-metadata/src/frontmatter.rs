use serde_json::Value;

/// テキストの先頭にある YAML Frontmatter (`---\n...---\n`) をパースし、
/// メタデータ（JSON Value）と純粋な本文に分離します。
pub fn extract_frontmatter_static(content: &str) -> (Value, &str) {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return (serde_json::json!({}), content);
    }

    // 先頭の "---" の直後の改行を探す
    let after_first_marker = &trimmed[3..];
    let yaml_start_idx = if let Some(idx) = after_first_marker.find('\n') {
        3 + idx + 1
    } else {
        return (serde_json::json!({}), content);
    };

    let rest = &trimmed[yaml_start_idx..];

    // 閉じの "\n---" を探す
    let mut search_idx = 0;
    while let Some(rel_idx) = rest[search_idx..].find("\n---") {
        let abs_idx = search_idx + rel_idx;
        let after_closing = &rest[abs_idx + 4..];

        // 閉じの "---" の直後が改行またはEOFならFrontmatter終端と判定
        if after_closing.is_empty() || after_closing.starts_with('\n') || after_closing.starts_with("\r\n") {
            let yaml_str = &rest[..abs_idx];
            let body = if after_closing.starts_with("\r\n") {
                &after_closing[2..]
            } else if after_closing.starts_with('\n') {
                &after_closing[1..]
            } else {
                after_closing
            };

            let metadata: Value = serde_yaml::from_str(yaml_str).unwrap_or_else(|_| serde_json::json!({}));
            return (metadata, body);
        }
        search_idx = abs_idx + 4;
    }

    (serde_json::json!({}), content)
}

/// メタデータオブジェクト（JSON Value）と本文を結合し、
/// 先頭に `---\n...---\n` の Frontmatter を付与した文字列を生成します。
pub fn format_frontmatter_static(metadata: &Value, content: &str) -> String {
    if metadata.is_object() && !metadata.as_object().unwrap().is_empty() {
        match serde_yaml::to_string(metadata) {
            Ok(yaml_str) => {
                let trimmed_yaml = yaml_str.trim_start_matches("---\n").trim_start_matches("---\r\n");
                format!("---\n{}---\n{}", trimmed_yaml, content)
            }
            Err(_) => content.to_string(),
        }
    } else {
        content.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_and_format_frontmatter() {
        let sample = "---\ntitle: 第一話\ntags:\n  - character\n---\n本文がここから始まります。";
        let (meta, body) = extract_frontmatter_static(sample);
        assert_eq!(meta["title"], "第一話");
        assert_eq!(meta["tags"][0], "character");
        assert_eq!(body, "本文がここから始まります。");

        let formatted = format_frontmatter_static(&meta, body);
        assert!(formatted.starts_with("---\n"));
        assert!(formatted.contains("title: 第一話"));
        assert!(formatted.ends_with("本文がここから始まります。"));
    }

    #[test]
    fn test_extract_without_frontmatter() {
        let sample = "普通のテキストファイルです。";
        let (meta, body) = extract_frontmatter_static(sample);
        assert!(meta.as_object().unwrap().is_empty());
        assert_eq!(body, sample);
    }
}
