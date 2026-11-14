use tauri::{command, AppHandle, Runtime};
use crate::models::*;
use crate::Result;
use crate::NovelaidMcpExt;

#[command]
pub(crate) async fn get_mcp_status<R: Runtime>(
    app: AppHandle<R>,
) -> Result<McpStatus> {
    Ok(app.novelaid_mcp().get_status().await)
}

#[command]
pub(crate) async fn start_mcp_server<R: Runtime>(
    app: AppHandle<R>,
    port: Option<u16>,
    permission: Option<McpPermissionLevel>,
) -> Result<McpStatus> {
    let mcp = app.novelaid_mcp();
    if let Some(p) = port {
        let cfg = mcp.get_status().await;
        mcp.update_config(McpConfig {
            enabled: true,
            port: p,
            permission: permission.unwrap_or(cfg.permission),
        }).await;
    } else if let Some(perm) = permission {
        let cfg = mcp.get_status().await;
        mcp.update_config(McpConfig {
            enabled: true,
            port: cfg.port,
            permission: perm,
        }).await;
    }

    mcp.start(app.clone()).await?;
    Ok(mcp.get_status().await)
}

#[command]
pub(crate) async fn stop_mcp_server<R: Runtime>(
    app: AppHandle<R>,
) -> Result<McpStatus> {
    let mcp = app.novelaid_mcp();
    mcp.stop().await?;
    Ok(mcp.get_status().await)
}

#[command]
pub(crate) async fn respond_tool_call<R: Runtime>(
    app: AppHandle<R>,
    payload: ToolCallResponsePayload,
) -> Result<()> {
    app.novelaid_mcp().respond_tool_call(payload).await
}

#[command]
pub(crate) async fn update_mcp_config<R: Runtime>(
    app: AppHandle<R>,
    config: McpConfig,
) -> Result<McpStatus> {
    let mcp = app.novelaid_mcp();
    mcp.update_config(config.clone()).await;

    if config.enabled {
        mcp.start(app.clone()).await?;
    } else {
        mcp.stop().await?;
    }

    Ok(mcp.get_status().await)
}
