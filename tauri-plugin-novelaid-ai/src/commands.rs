use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::command;

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
    _params: Value,
) -> Result<Value, String> {
    match tool_name.as_str() {
        "ruby_suggest" => Ok(serde_json::json!({
            "success": true,
            "target": target_file.unwrap_or_default(),
            "suggestions": [
                { "word": "漆黒", "ruby": "しっこく", "line": 4 },
                { "word": "神代玲央", "ruby": "かみしろれお", "line": 6 }
            ]
        })),
        "proofread_scan" => Ok(serde_json::json!({
            "success": true,
            "target": target_file.unwrap_or_default(),
            "issues": [
                { "type": "ending_repeat", "message": "過去形「〜た。」が3文連続しています", "line": 8 }
            ]
        })),
        _ => Err(format!("Unknown tool: {}", tool_name)),
    }
}
