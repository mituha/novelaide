use tauri::{plugin::PluginApi, AppHandle, Runtime};
use serde::de::DeserializeOwned;
use crate::models::*;
use crate::Result;

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<NovelaidCalibration<R>> {
    Ok(NovelaidCalibration::new(app.clone()))
}

pub struct NovelaidCalibration<R: Runtime> {
    _app: tauri::AppHandle<R>,
}

impl<R: Runtime> NovelaidCalibration<R> {
    pub fn new(app: tauri::AppHandle<R>) -> Self {
        Self { _app: app }
    }

    pub fn ping(&self, payload: PingRequest) -> Result<PingResponse> {
        Ok(PingResponse {
            value: payload.value,
        })
    }

    pub fn check_text(&self, text: &str) -> Result<CheckTextResult> {
        let mut issues = Vec::new();
        let mut kanji_count = 0;
        let mut hiragana_count = 0;
        let mut total_chars = 0;

        let lines: Vec<&str> = text.lines().collect();
        for (line_idx, line) in lines.iter().enumerate() {
            let line_num = (line_idx + 1) as u32;

            for c in line.chars() {
                total_chars += 1;
                if ('\u{4E00}'..='\u{9FFF}').contains(&c) {
                    kanji_count += 1;
                } else if ('\u{3040}'..='\u{309F}').contains(&c) {
                    hiragana_count += 1;
                }
            }

            // モック作法チェック1: 会話文末の句点 (「〜〜。」)
            if line.contains("。」") {
                if let Some(col) = line.find("。」") {
                    issues.push(CalibrationIssue {
                        id: format!("closing-period-{}-{}", line_num, col),
                        rule_id: "novel-closing-period".into(),
                        rule_type: "novel_style".into(),
                        message: "かぎ括弧末尾の句点「。」は原則として省略します".into(),
                        range: CalibrationRange {
                            start_line: line_num,
                            start_column: (col + 1) as u32,
                            end_line: line_num,
                            end_column: (col + 3) as u32,
                        },
                        suggestion: Some("」".into()),
                    });
                }
            }

            // モック作法チェック2: 三点リーダー1マス (単独の …)
            // 「……」でなく奇数個のケースを簡易検出
            if line.contains('…') && !line.contains("……") {
                if let Some(col) = line.find('…') {
                    issues.push(CalibrationIssue {
                        id: format!("single-leader-{}-{}", line_num, col),
                        rule_id: "novel-three-dots-leader".into(),
                        rule_type: "novel_style".into(),
                        message: "三点リーダーは2マス（偶数「……」）で使用するのが作法です".into(),
                        range: CalibrationRange {
                            start_line: line_num,
                            start_column: (col + 1) as u32,
                            end_line: line_num,
                            end_column: (col + 2) as u32,
                        },
                        suggestion: Some("……".into()),
                    });
                }
            }

            // モック漢字の開きチェック: 「事」
            if line.contains("事") {
                if let Some(col) = line.find("事") {
                    issues.push(CalibrationIssue {
                        id: format!("kanji-koto-{}-{}", line_num, col),
                        rule_id: "kanji-open-close".into(),
                        rule_type: "kanji_open_close".into(),
                        message: "形式名詞「事」は平仮名「こと」で開くことが推奨されます".into(),
                        range: CalibrationRange {
                            start_line: line_num,
                            start_column: (col + 1) as u32,
                            end_line: line_num,
                            end_column: (col + 2) as u32,
                        },
                        suggestion: Some("こと".into()),
                    });
                }
            }

            // モック助詞連続チェック: 「の」が3回以上
            let no_count = line.matches('の').count();
            if no_count >= 3 {
                issues.push(CalibrationIssue {
                    id: format!("multiple-no-{}", line_num),
                    rule_id: "no-doubled-joshi".into(),
                    rule_type: "particle_repetition".into(),
                    message: format!("同一行内で助詞「の」が{}回使用されています。文を分割するか言い換えを検討してください", no_count),
                    range: CalibrationRange {
                        start_line: line_num,
                        start_column: 1,
                        end_line: line_num,
                        end_column: (line.chars().count() + 1) as u32,
                    },
                    suggestion: None,
                });
            }
        }

        let kanji_ratio = if total_chars > 0 {
            (kanji_count as f32 / total_chars as f32) * 100.0
        } else {
            0.0
        };

        let hiragana_ratio = if total_chars > 0 {
            (hiragana_count as f32 / total_chars as f32) * 100.0
        } else {
            0.0
        };

        // モック頻出語
        let frequencies = vec![
            FrequencyItem { word: "神代".into(), count: 4, pos: "名詞".into() },
            FrequencyItem { word: "魔導".into(), count: 3, pos: "名詞".into() },
            FrequencyItem { word: "言う".into(), count: 5, pos: "動詞".into() },
            FrequencyItem { word: "静か".into(), count: 2, pos: "形容動詞".into() },
        ];

        Ok(CheckTextResult {
            issues,
            frequencies,
            total_chars,
            kanji_ratio,
            hiragana_ratio,
        })
    }

    pub fn tokenize_text(&self, text: &str) -> Result<Vec<TokenInfo>> {
        // Lindera導入前のモック形態素トークン
        let mut tokens = Vec::new();
        for word in text.split_whitespace() {
            tokens.push(TokenInfo {
                surface: word.to_string(),
                pos: "名詞".into(),
                reading: Some("モック".into()),
                base_form: Some(word.to_string()),
            });
        }
        Ok(tokens)
    }

    pub fn get_ruby_candidates(&self, text: &str) -> Result<Vec<RubyCandidate>> {
        // モックルビ候補
        let mut candidates = Vec::new();
        let lines: Vec<&str> = text.lines().collect();

        for (line_idx, line) in lines.iter().enumerate() {
            let line_num = (line_idx + 1) as u32;

            if line.contains("神代玲央") && !line.contains("｜神代玲央") {
                if let Some(col) = line.find("神代玲央") {
                    candidates.push(RubyCandidate {
                        surface: "神代玲央".into(),
                        ruby: "かみしろれお".into(),
                        range: CalibrationRange {
                            start_line: line_num,
                            start_column: (col + 1) as u32,
                            end_line: line_num,
                            end_column: (col + 5) as u32,
                        },
                    });
                }
            }
            if line.contains("邂逅") && !line.contains("｜邂逅") {
                if let Some(col) = line.find("邂逅") {
                    candidates.push(RubyCandidate {
                        surface: "邂逅".into(),
                        ruby: "かいこう".into(),
                        range: CalibrationRange {
                            start_line: line_num,
                            start_column: (col + 1) as u32,
                            end_line: line_num,
                            end_column: (col + 3) as u32,
                        },
                    });
                }
            }
        }

        Ok(candidates)
    }
}
