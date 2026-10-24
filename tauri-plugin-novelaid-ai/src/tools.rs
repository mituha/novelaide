use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProofreadIssue {
    pub r#type: String,
    pub message: String,
    pub line: usize,
    pub text: String,
    pub suggestion: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RubyCandidate {
    pub word: String,
    pub ruby: String,
    pub line: usize,
}

/// 高速校正スキャン処理（文末重複、ら抜き言葉など）
pub fn scan_proofread(content: &str) -> Vec<ProofreadIssue> {
    let mut issues = Vec::new();
    let lines: Vec<&str> = content.lines().collect();

    let mut past_count = 0;

    for (idx, line) in lines.iter().enumerate() {
        let line_num = idx + 1;
        let trimmed = line.trim();

        // 空行はカウントリセット
        if trimmed.is_empty() {
            past_count = 0;
            continue;
        }

        // 1. 文末の過去形連続（〜た。 / 〜だった。）
        if trimmed.ends_with("た。") || trimmed.ends_with("だ。") {
            past_count += 1;
            let ending_str = if trimmed.ends_with("た。") { "〜た。" } else { "〜だ。" };

            if past_count >= 3 {
                issues.push(ProofreadIssue {
                    r#type: "ending_repetition".to_string(),
                    message: format!("文末「{}」が{}文連続しています。体言止めや描写を交えてリズムに変化をつける推敲を検討できます。", ending_str, past_count),
                    line: line_num,
                    text: trimmed.to_string(),
                    suggestion: Some("体言止め、または進行形・感覚描写への変更".to_string()),
                });
            }
        } else {
            past_count = 0;
        }

        // 2. ら抜き言葉のチェック
        let ranuki_patterns = [
            ("見れる", "見られる"),
            ("来れる", "来られる"),
            ("食べれる", "食べられる"),
            ("出れる", "出られる"),
            ("着れる", "着られる"),
        ];

        for (ranuki, correct) in ranuki_patterns {
            if trimmed.contains(ranuki) {
                issues.push(ProofreadIssue {
                    r#type: "ranuki_word".to_string(),
                    message: format!("「{}」は「ら抜き言葉」の可能性があります（正しくは「{}」）。", ranuki, correct),
                    line: line_num,
                    text: ranuki.to_string(),
                    suggestion: Some(correct.to_string()),
                });
            }
        }

        // 3. 冗長な表現（〜することができる）
        if trimmed.contains("することができる") || trimmed.contains("することができた") {
            issues.push(ProofreadIssue {
                r#type: "redundant_expression".to_string(),
                message: "「〜することができる」は「〜できる」に簡潔化できます。".to_string(),
                line: line_num,
                text: "することができる".to_string(),
                suggestion: Some("〜できる".to_string()),
            });
        }
    }

    issues
}

/// ルビ候補の自動抽出
pub fn extract_ruby_candidates(content: &str) -> Vec<RubyCandidate> {
    let mut candidates = Vec::new();
    let lines: Vec<&str> = content.lines().collect();

    // 既にルビが振られている親文字を収集
    let mut already_rubied = std::collections::HashSet::new();
    for cap in content.split('|') {
        if let Some(pos) = cap.find('《') {
            let parent = &cap[..pos];
            if !parent.is_empty() {
                already_rubied.insert(parent.to_string());
            }
        }
    }

    // 小説で頻出する代表的な固有名詞・難読語辞書（共通定義）
    let dict = [
        ("漆黒", "しっこく"),
        ("神代玲央", "かみしろれお"),
        ("常闇", "とこやみ"),
        ("黎明", "れいめい"),
        ("黄昏", "たそがれ"),
        ("深淵", "しんえん"),
        ("邂逅", "かいこう"),
        ("隻眼", "せきがん"),
        ("刹那", "せつな"),
        ("泡沫", "うたかた"),
    ];

    for (idx, line) in lines.iter().enumerate() {
        let line_num = idx + 1;
        for (word, ruby) in dict {
            if line.contains(word) && !already_rubied.contains(word) {
                // 重複追加防止
                if !candidates.iter().any(|c: &RubyCandidate| c.word == word) {
                    candidates.push(RubyCandidate {
                        word: word.to_string(),
                        ruby: ruby.to_string(),
                        line: line_num,
                    });
                }
            }
        }
    }

    candidates
}
