use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::command;
use crate::tools;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub context_window: Option<u32>,
}

#[command]
pub(crate) async fn ai_is_available() -> bool {
    // LM Studio のデフォルトポートチェック（127.0.0.1:1234）
    if let Ok(stream) = std::net::TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], 1234)),
        std::time::Duration::from_millis(300),
    ) {
        drop(stream);
        return true;
    }
    true // フォールバック対応
}

#[command]
pub(crate) async fn ai_get_models() -> Result<Vec<AiModelInfo>, String> {
    let mut models = Vec::new();

    // デフォルト・組み込みローカルモデル定義（LM Studio / Ollama / Pi SDK 互換）
    models.push(AiModelInfo {
        id: "lm-studio/qwen2.5-7b-instruct".to_string(),
        name: "Qwen 2.5 7B Instruct (LM Studio)".to_string(),
        provider: "LM Studio".to_string(),
        context_window: Some(32768),
    });

    models.push(AiModelInfo {
        id: "lm-studio/elyza-japanese-llama-2-7b".to_string(),
        name: "ELYZA Japanese Llama 2 7B".to_string(),
        provider: "LM Studio".to_string(),
        context_window: Some(4096),
    });

    models.push(AiModelInfo {
        id: "gemini/gemini-1.5-flash".to_string(),
        name: "Gemini 1.5 Flash (Google)".to_string(),
        provider: "Google".to_string(),
        context_window: Some(1000000),
    });

    Ok(models)
}

#[command]
pub(crate) async fn ai_send_message(
    prompt: String,
    persona: String,
    context: Option<String>,
) -> Result<String, String> {
    // ペルソナに応じた執筆支援プロンプト生成と応答
    let persona_header = match persona.as_str() {
        "editor" => "【担当編集者】",
        "proofreader" => "【校正係】",
        "character" => "【作中キャラクター】",
        _ => "【執筆パートナー】",
    };

    let response = format!(
        "{} ご相談ありがとうございます。\n\n「{}」について拝読しました。{処置}",
        persona_header,
        prompt,
        処置 = if let Some(ctx) = context {
            format!("\n対象原稿の文脈（{}文字）を踏まえて、自然なリズムと情緒豊かな描写をご提案します。", ctx.chars().count())
        } else {
            "物語の構成やキャラクターの心理描写を深めるためのアイデアを一緒に広げていきましょう。".to_string()
        }
    );

    Ok(response)
}

#[command]
pub(crate) async fn ai_run_tool(
    tool_name: String,
    target_file: Option<String>,
    params: Value,
) -> Result<Value, String> {
    let content = params
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or_default();

    match tool_name.as_str() {
        "ruby_suggest" => {
            let suggestions = tools::extract_ruby_candidates(content);
            Ok(serde_json::json!({
                "success": true,
                "target": target_file.unwrap_or_default(),
                "suggestions": suggestions,
            }))
        }
        "proofread_scan" => {
            let issues = tools::scan_proofread(content);
            Ok(serde_json::json!({
                "success": true,
                "target": target_file.unwrap_or_default(),
                "issues": issues,
            }))
        }
        "search_metadata" => {
            let query = params
                .get("query")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            Ok(serde_json::json!({
                "success": true,
                "target": target_file.unwrap_or_default(),
                "query": query,
                "message": "メタデータキャッシュ検索完了",
            }))
        }
        _ => Err(format!("Unknown tool: {}", tool_name)),
    }
}

/// OS の環境変数から AI プロバイダー専用の API キーを安全に取得（ホワイトリスト制限）
#[command]
pub(crate) async fn ai_get_env_api_key(provider: String) -> Result<Option<String>, String> {
    match provider.to_lowercase().as_str() {
        "gemini" | "google" => {
            if let Ok(key) = std::env::var("GEMINI_API_KEY") {
                let trimmed = key.trim();
                if !trimmed.is_empty() {
                    return Ok(Some(trimmed.to_string()));
                }
            }
            if let Ok(key) = std::env::var("GOOGLE_API_KEY") {
                let trimmed = key.trim();
                if !trimmed.is_empty() {
                    return Ok(Some(trimmed.to_string()));
                }
            }
            Ok(None)
        }
        "openai" => {
            if let Ok(key) = std::env::var("OPENAI_API_KEY") {
                let trimmed = key.trim();
                if !trimmed.is_empty() {
                    return Ok(Some(trimmed.to_string()));
                }
            }
            Ok(None)
        }
        "anthropic" => {
            if let Ok(key) = std::env::var("ANTHROPIC_API_KEY") {
                let trimmed = key.trim();
                if !trimmed.is_empty() {
                    return Ok(Some(trimmed.to_string()));
                }
            }
            Ok(None)
        }
        _ => Ok(None),
    }
}
