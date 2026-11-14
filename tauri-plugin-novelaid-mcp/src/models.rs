use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../guest-js/models.ts")]
#[serde(rename_all = "lowercase")]
pub enum McpPermissionLevel {
    Read,
    Write,
}

impl Default for McpPermissionLevel {
    fn default() -> Self {
        Self::Read
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../guest-js/models.ts")]
#[serde(rename_all = "camelCase")]
pub struct McpConfig {
    pub enabled: bool,
    pub port: u16,
    pub permission: McpPermissionLevel,
}

impl Default for McpConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            port: 28540,
            permission: McpPermissionLevel::Read,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../guest-js/models.ts")]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub is_running: bool,
    pub port: u16,
    pub permission: McpPermissionLevel,
    pub client_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../guest-js/models.ts")]
#[serde(rename_all = "camelCase")]
pub struct ToolCallRequestEvent {
    pub call_id: String,
    pub tool_name: String,
    #[ts(type = "Record<string, unknown>")]
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../guest-js/models.ts")]
#[serde(rename_all = "camelCase")]
pub struct ToolCallResponsePayload {
    pub call_id: String,
    #[ts(type = "any")]
    pub result: serde_json::Value,
    pub is_error: bool,
}

// --- JSON-RPC 2.0 / MCP プロトコルモデル ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: Option<serde_json::Value>,
    pub method: String,
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i64,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolInfo {
    pub name: String,
    pub description: String,
    #[serde(rename = "inputSchema")]
    pub input_schema: serde_json::Value,
}
