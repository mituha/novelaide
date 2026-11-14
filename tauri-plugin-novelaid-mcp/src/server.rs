use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use serde_json::json;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, oneshot, RwLock};
use uuid::Uuid;

use crate::models::*;
use crate::{Error, Result};

pub struct McpServerManager {
    is_running: Arc<AtomicBool>,
    config: Arc<RwLock<McpConfig>>,
    client_count: Arc<AtomicUsize>,
    pending_calls: Arc<RwLock<HashMap<String, oneshot::Sender<ToolCallResponsePayload>>>>,
    client_senders: Arc<RwLock<HashMap<String, mpsc::UnboundedSender<String>>>>,
    shutdown_sender: Arc<RwLock<Option<oneshot::Sender<()>>>>,
}

impl McpServerManager {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
            config: Arc::new(RwLock::new(McpConfig::default())),
            client_count: Arc::new(AtomicUsize::new(0)),
            pending_calls: Arc::new(RwLock::new(HashMap::new())),
            client_senders: Arc::new(RwLock::new(HashMap::new())),
            shutdown_sender: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn get_status(&self) -> McpStatus {
        let cfg = self.config.read().await;
        McpStatus {
            is_running: self.is_running.load(Ordering::SeqCst),
            port: cfg.port,
            permission: cfg.permission,
            client_count: self.client_count.load(Ordering::SeqCst),
        }
    }

    pub async fn update_config(&self, new_config: McpConfig) {
        let mut cfg = self.config.write().await;
        *cfg = new_config;
    }

    pub async fn start<R: Runtime>(&self, app: AppHandle<R>) -> Result<u16> {
        if self.is_running.load(Ordering::SeqCst) {
            let cfg = self.config.read().await;
            return Ok(cfg.port);
        }

        let port = {
            let cfg = self.config.read().await;
            cfg.port
        };

        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        let listener = TcpListener::bind(addr).await.map_err(|e| {
            Error::ServerError(format!("Failed to bind to port {}: {}", port, e))
        })?;

        let actual_port = listener.local_addr()?.port();
        {
            let mut cfg = self.config.write().await;
            cfg.port = actual_port;
            cfg.enabled = true;
        }

        self.is_running.store(true, Ordering::SeqCst);
        let (shutdown_tx, mut shutdown_rx) = oneshot::channel();
        {
            let mut s_lock = self.shutdown_sender.write().await;
            *s_lock = Some(shutdown_tx);
        }

        let is_running_clone = self.is_running.clone();
        let config_clone = self.config.clone();
        let pending_calls_clone = self.pending_calls.clone();
        let client_senders_clone = self.client_senders.clone();
        let client_count_clone = self.client_count.clone();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut shutdown_rx => {
                        break;
                    }
                    accept_res = listener.accept() => {
                        match accept_res {
                            Ok((stream, _)) => {
                                let app_handle = app.clone();
                                let config_ref = config_clone.clone();
                                let pending_calls_ref = pending_calls_clone.clone();
                                let client_senders_ref = client_senders_clone.clone();
                                let client_count_ref = client_count_clone.clone();

                                tokio::spawn(async move {
                                    handle_connection(
                                        stream,
                                        app_handle,
                                        config_ref,
                                        pending_calls_ref,
                                        client_senders_ref,
                                        client_count_ref,
                                    ).await;
                                });
                            }
                            Err(e) => {
                                eprintln!("[novelaid-mcp] Accept error: {}", e);
                            }
                        }
                    }
                }
            }
            is_running_clone.store(false, Ordering::SeqCst);
            eprintln!("[novelaid-mcp] Server stopped on port {}", actual_port);
        });

        Ok(actual_port)
    }

    pub async fn stop(&self) -> Result<()> {
        if !self.is_running.load(Ordering::SeqCst) {
            return Ok(());
        }

        let mut s_lock = self.shutdown_sender.write().await;
        if let Some(tx) = s_lock.take() {
            let _ = tx.send(());
        }

        self.is_running.store(false, Ordering::SeqCst);
        {
            let mut cfg = self.config.write().await;
            cfg.enabled = false;
        }

        Ok(())
    }

    pub async fn respond_tool_call(&self, payload: ToolCallResponsePayload) -> Result<()> {
        let mut calls = self.pending_calls.write().await;
        if let Some(sender) = calls.remove(&payload.call_id) {
            let _ = sender.send(payload);
            Ok(())
        } else {
            eprintln!("[novelaid-mcp] Warning: Pending tool call not found (already resolved or timed out): {}", payload.call_id);
            Ok(())
        }
    }
}

// --- HTTP / SSE コネクションハンドラー ---

async fn handle_connection<R: Runtime>(
    mut stream: TcpStream,
    app: AppHandle<R>,
    config: Arc<RwLock<McpConfig>>,
    pending_calls: Arc<RwLock<HashMap<String, oneshot::Sender<ToolCallResponsePayload>>>>,
    client_senders: Arc<RwLock<HashMap<String, mpsc::UnboundedSender<String>>>>,
    client_count: Arc<AtomicUsize>,
) {
    let mut buffer = [0u8; 8192];
    let n = match stream.read(&mut buffer).await {
        Ok(n) if n > 0 => n,
        _ => return,
    };

    let request_str = String::from_utf8_lossy(&buffer[..n]);
    let mut lines = request_str.lines();
    let first_line = lines.next().unwrap_or("");
    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if parts.len() < 2 {
        return;
    }

    let method = parts[0];
    let uri = parts[1];

    // CORS preflight
    if method == "OPTIONS" {
        let response = "HTTP/1.1 204 No Content\r\n\
Access-Control-Allow-Origin: *\r\n\
Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
Access-Control-Allow-Headers: Content-Type\r\n\
Content-Length: 0\r\n\r\n";
        let _ = stream.write_all(response.as_bytes()).await;
        return;
    }

    // 1. GET /sse (Server-Sent Events 開始)
    if method == "GET" && uri.starts_with("/sse") {
        let session_id = Uuid::new_v4().to_string();
        let (tx, mut rx) = mpsc::unbounded_channel::<String>();

        {
            let mut senders = client_senders.write().await;
            senders.insert(session_id.clone(), tx);
            client_count.fetch_add(1, Ordering::SeqCst);
        }

        let initial_headers = "HTTP/1.1 200 OK\r\n\
Content-Type: text/event-stream\r\n\
Cache-Control: no-cache\r\n\
Connection: keep-alive\r\n\
Access-Control-Allow-Origin: *\r\n\r\n";

        if stream.write_all(initial_headers.as_bytes()).await.is_err() {
            return;
        }

        // 初期エンドポイントイベント送信
        let endpoint_event = format!("event: endpoint\ndata: /message?sessionId={}\n\n", session_id);
        if stream.write_all(endpoint_event.as_bytes()).await.is_err() {
            return;
        }

        // SSE メッセージ送信用ループ
        let session_id_clone = session_id.clone();
        let client_senders_ref = client_senders.clone();
        let client_count_ref = client_count.clone();

        loop {
            tokio::select! {
                Some(msg) = rx.recv() => {
                    let sse_event = format!("event: message\ndata: {}\n\n", msg);
                    if stream.write_all(sse_event.as_bytes()).await.is_err() {
                        break;
                    }
                }
                else => {
                    break;
                }
            }
        }

        {
            let mut senders = client_senders_ref.write().await;
            senders.remove(&session_id_clone);
            client_count_ref.fetch_sub(1, Ordering::SeqCst);
        }
        return;
    }

    // 2. POST /message?sessionId=xxx (JSON-RPC リクエスト受信)
    if method == "POST" && uri.starts_with("/message") {
        let session_id = uri.split("sessionId=").nth(1).unwrap_or("").to_string();

        // HTTP ボディの抽出
        let body = if let Some(idx) = request_str.find("\r\n\r\n") {
            &request_str[idx + 4..]
        } else {
            ""
        };

        if let Ok(json_req) = serde_json::from_str::<JsonRpcRequest>(body) {
            let response = "HTTP/1.1 202 Accepted\r\n\
Access-Control-Allow-Origin: *\r\n\
Content-Length: 0\r\n\r\n";
            let _ = stream.write_all(response.as_bytes()).await;

            // JSON-RPC の処理と SSE ストリームへの非同期プッシュ
            let sender_opt = {
                let senders = client_senders.read().await;
                senders.get(&session_id).cloned()
            };

            if let Some(sender) = sender_opt {
                let app_handle = app.clone();
                let config_ref = config.clone();
                let pending_calls_ref = pending_calls.clone();

                tokio::spawn(async move {
                    let res = handle_json_rpc(
                        json_req,
                        app_handle,
                        config_ref,
                        pending_calls_ref,
                    ).await;

                    if let Some(json_res) = res {
                        if let Ok(res_str) = serde_json::to_string(&json_res) {
                            let _ = sender.send(res_str);
                        }
                    }
                });
            }
        } else {
            let err_res = "HTTP/1.1 400 Bad Request\r\n\
Content-Length: 0\r\n\r\n";
            let _ = stream.write_all(err_res.as_bytes()).await;
        }
    }
}

// --- JSON-RPC 2.0 / MCP ツールプロトコル処理 ---

async fn handle_json_rpc<R: Runtime>(
    req: JsonRpcRequest,
    app: AppHandle<R>,
    config: Arc<RwLock<McpConfig>>,
    pending_calls: Arc<RwLock<HashMap<String, oneshot::Sender<ToolCallResponsePayload>>>>,
) -> Option<JsonRpcResponse> {
    let req_id = req.id.clone()?;

    match req.method.as_str() {
        "initialize" => {
            Some(JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: req_id,
                result: Some(json!({
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {}
                    },
                    "serverInfo": {
                        "name": "novelaide-mcp",
                        "version": "0.62.0"
                    }
                })),
                error: None,
            })
        }
        "notifications/initialized" => {
            // 通知のため応答不要
            None
        }
        "ping" => {
            Some(JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: req_id,
                result: Some(json!({})),
                error: None,
            })
        }
        "tools/list" => {
            let permission = {
                let cfg = config.read().await;
                cfg.permission
            };

            let tools = get_tool_definitions(permission);
            Some(JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: req_id,
                result: Some(json!({ "tools": tools })),
                error: None,
            })
        }
        "tools/call" => {
            let params = req.params.unwrap_or(serde_json::Value::Null);
            let tool_name = params.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let arguments = params.get("arguments").cloned().unwrap_or(json!({}));

            let permission = {
                let cfg = config.read().await;
                cfg.permission
            };

            // 権限チェック（ReadOnly 時に write 系ツールを拒絶）
            if (tool_name == "write_file" || tool_name == "edit_file" || tool_name == "write" || tool_name == "edit")
                && permission == McpPermissionLevel::Read
            {
                return Some(JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: req_id,
                    result: Some(json!({
                        "content": [{
                            "type": "text",
                            "text": "エラー: novelaide の MCP サーバーは現在 [読み取り専用 (ReadOnly)] に設定されています。ファイルの編集・書き込みは拒絶されました。"
                        }],
                        "isError": true
                    })),
                    error: None,
                });
            }

            // フロントエンドへディスパッチして結果待機
            let call_id = Uuid::new_v4().to_string();
            let (tx, rx) = oneshot::channel();

            {
                let mut calls = pending_calls.write().await;
                calls.insert(call_id.clone(), tx);
            }

            let event = ToolCallRequestEvent {
                call_id: call_id.clone(),
                tool_name: tool_name.clone(),
                arguments,
            };

            if let Err(e) = app.emit("mcp://tool-call", event) {
                return Some(JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: req_id,
                    result: None,
                    error: Some(JsonRpcError {
                        code: -32603,
                        message: format!("Failed to dispatch tool call to frontend: {}", e),
                        data: None,
                    }),
                });
            }

            // 最大30秒待機
            match tokio::time::timeout(Duration::from_secs(30), rx).await {
                Ok(Ok(response_payload)) => {
                    let text = if response_payload.result.is_string() {
                        response_payload.result.as_str().unwrap().to_string()
                    } else {
                        serde_json::to_string_pretty(&response_payload.result).unwrap_or_default()
                    };

                    Some(JsonRpcResponse {
                        jsonrpc: "2.0".to_string(),
                        id: req_id,
                        result: Some(json!({
                            "content": [{
                                "type": "text",
                                "text": text
                            }],
                            "isError": response_payload.is_error
                        })),
                        error: None,
                    })
                }
                Ok(Err(_)) => {
                    Some(JsonRpcResponse {
                        jsonrpc: "2.0".to_string(),
                        id: req_id,
                        result: None,
                        error: Some(JsonRpcError {
                            code: -32603,
                            message: "Internal error: tool response channel dropped".to_string(),
                            data: None,
                        }),
                    })
                }
                Err(_) => {
                    // タイムアウト
                    {
                        let mut calls = pending_calls.write().await;
                        calls.remove(&call_id);
                    }
                    Some(JsonRpcResponse {
                        jsonrpc: "2.0".to_string(),
                        id: req_id,
                        result: Some(json!({
                            "content": [{
                                "type": "text",
                                "text": "エラー: ツール実行がタイムアウト（30秒）しました。"
                            }],
                            "isError": true
                        })),
                        error: None,
                    })
                }
            }
        }
        _ => Some(JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: req_id,
            result: None,
            error: Some(JsonRpcError {
                code: -32601,
                message: format!("Method not found: {}", req.method),
                data: None,
            }),
        }),
    }
}

// --- MCP 公開ツール定義 ---

fn get_tool_definitions(permission: McpPermissionLevel) -> Vec<McpToolInfo> {
    let mut tools = vec![
        McpToolInfo {
            name: "read_file".to_string(),
            description: "プロジェクト内のファイル（原稿・設定・プロット等）を読み込みます。エディターで開かれている未保存バッファを最優先します。".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "ファイルパス（プロジェクト相対パスまたはファイル名）" },
                    "offset": { "type": "number", "description": "開始行番号（1-indexed, 省略時は先頭）" },
                    "limit": { "type": "number", "description": "最大読み込み行数" }
                },
                "required": ["path"]
            }),
        },
        McpToolInfo {
            name: "get_open_documents".to_string(),
            description: "現在エディターで開かれているドキュメント（タブ）一覧と未保存（dirty）状態を取得します。".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {}
            }),
        },
        McpToolInfo {
            name: "get_active_document".to_string(),
            description: "現在フォーカスされている原稿の最新バッファ（未保存テキスト含む）を取得します。".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "side": { "type": "string", "enum": ["left", "right"], "description": "左右ペインの指定（省略時はアクティブペイン）" }
                }
            }),
        },
        McpToolInfo {
            name: "search_metadata".to_string(),
            description: "作品内の設定資料（登場人物・地名・世界観・プロット）のFrontmatterおよび本文をキーワード検索します。".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "検索キーワード（例: 主人公, 帝都, 魔法）" }
                },
                "required": ["query"]
            }),
        },
        McpToolInfo {
            name: "search_text".to_string(),
            description: "プロジェクト内の全ファイル（原稿・設定・プロット等）を対象にキーワードを全文検索し、マッチした行番号・該当行テキスト・前後スニペットを返却します。エディターで開かれている未保存バッファを最優先で走査します。".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "検索キーワード（例: 魔導書, 「行こう」, 賢者の石）" },
                    "path_filter": { "type": "string", "description": "ファイルパスまたはフォルダー名での絞り込み（例: 01_本編, characters, .md）" },
                    "case_sensitive": { "type": "boolean", "description": "大文字と小文字を区別するかどうか（省略時は false）" }
                },
                "required": ["query"]
            }),
        },
        McpToolInfo {
            name: "scan_proofread".to_string(),
            description: "原稿テキストに対し、純Rust製 Lindera による本格校正（三点リーダー、会話文末、重言、ら抜き言葉等）を実行します。".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "text": { "type": "string", "description": "校正対象のテキスト（省略時は現在アクティブな原稿の全バッファ）" }
                }
            }),
        },
        McpToolInfo {
            name: "extract_ruby".to_string(),
            description: "本文内の難読漢字や固有名詞からルビ候補を自動抽出し、novelaid形式（|親文字《ルビ》）を返却します。".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "text": { "type": "string", "description": "ルビ抽出対象のテキスト（省略時は現在アクティブな原稿の全バッファ）" }
                }
            }),
        },
        McpToolInfo {
            name: "get_project_structure".to_string(),
            description: "プロジェクト内のファイルツリー構造（原稿・設定・プロット一覧）を取得します。".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {}
            }),
        },
        McpToolInfo {
            name: "find_files".to_string(),
            description: "プロジェクト内のファイルをパターン（ワイルドカード * 対応、例: *第1部*, characters/*.md）またはドキュメント種別で高速探索します。".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "pattern": { "type": "string", "description": "ファイル名またはパスの検索パターン（例: *第1章*, 00_*, characters/*.md, *.ch）" },
                    "type": { "type": "string", "enum": ["all", "novel", "markdown", "chat", "code"], "description": "ファイル種別による絞り込み（省略時は all）" }
                },
                "required": ["pattern"]
            }),
        },
        McpToolInfo {
            name: "get_project_outline".to_string(),
            description: "プロジェクト内の全小説エピソードの目次・章題・概要（Frontmatter description）・見出しを一括取得し、プロット構成を俯瞰します。".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "include_summary": { "type": "boolean", "description": "Frontmatter の概要 (description) を含めるか（省略時は true）" },
                    "include_headings": { "type": "boolean", "description": "本文内の Markdown 見出し (#, ##) を含めるか（省略時は false）" }
                }
            }),
        },
    ];

    if permission == McpPermissionLevel::Write {
        tools.push(McpToolInfo {
            name: "write_file".to_string(),
            description: "ファイルの内容を新規作成または全置換更新します（エディターバッファへ即時同期、未保存状態）。".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "書き込み対象ファイルパス" },
                    "content": { "type": "string", "description": "ファイルの内容" }
                },
                "required": ["path", "content"]
            }),
        });
        tools.push(McpToolInfo {
            name: "edit_file".to_string(),
            description: "原稿または設定ファイルに対し、完全一致テキスト置換（oldText -> newText）による安全な部分編集を適用します。".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "編集対象ファイルパス" },
                    "edits": {
                        "type": "array",
                        "description": "置換ブロックの配列",
                        "items": {
                            "type": "object",
                            "properties": {
                                "oldText": { "type": "string", "description": "置換前の完全一致テキスト" },
                                "newText": { "type": "string", "description": "置換後の新しいテキスト" }
                            },
                            "required": ["oldText", "newText"]
                        }
                    }
                },
                "required": ["path", "edits"]
            }),
        });
    }

    tools
}
