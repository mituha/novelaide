import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import {
  McpConfig,
  McpPermissionLevel,
  McpStatus,
  ToolCallRequestEvent,
  ToolCallResponsePayload,
} from './models';

export * from './models';
export * from './domain/tools';

export async function getMcpStatus(): Promise<McpStatus> {
  return await invoke<McpStatus>('plugin:novelaid-mcp|get_mcp_status');
}

export async function startMcpServer(
  port?: number,
  permission?: McpPermissionLevel
): Promise<McpStatus> {
  return await invoke<McpStatus>('plugin:novelaid-mcp|start_mcp_server', {
    port,
    permission,
  });
}

export async function stopMcpServer(): Promise<McpStatus> {
  return await invoke<McpStatus>('plugin:novelaid-mcp|stop_mcp_server');
}

export async function respondToolCall(payload: ToolCallResponsePayload): Promise<void> {
  return await invoke<void>('plugin:novelaid-mcp|respond_tool_call', {
    payload,
  });
}

export async function updateMcpConfig(config: McpConfig): Promise<McpStatus> {
  return await invoke<McpStatus>('plugin:novelaid-mcp|update_mcp_config', {
    config,
  });
}

/**
 * MCP サーバー（Rust）から中継されてくるツール実行要求を購読し、
 * ハンドラーで実行した結果を即座に応答するリスナーを登録する
 */
export async function listenToolCalls(
  handler: (event: ToolCallRequestEvent) => Promise<{ result: any; isError?: boolean }>
): Promise<UnlistenFn> {
  return await listen<ToolCallRequestEvent>('mcp://tool-call', async (tauriEvent) => {
    const { callId } = tauriEvent.payload;
    try {
      const { result, isError } = await handler(tauriEvent.payload);
      await respondToolCall({
        callId,
        result,
        isError: !!isError,
      });
    } catch (err: any) {
      await respondToolCall({
        callId,
        result: {
          error: String(err?.message || err),
        },
        isError: true,
      });
    }
  });
}
