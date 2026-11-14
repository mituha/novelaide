import { UnlistenFn } from '@tauri-apps/api/event';
import { McpConfig, McpPermissionLevel, McpStatus, ToolCallRequestEvent, ToolCallResponsePayload } from './models';
export * from './models';
export * from './domain/tools';
export declare function getMcpStatus(): Promise<McpStatus>;
export declare function startMcpServer(port?: number, permission?: McpPermissionLevel): Promise<McpStatus>;
export declare function stopMcpServer(): Promise<McpStatus>;
export declare function respondToolCall(payload: ToolCallResponsePayload): Promise<void>;
export declare function updateMcpConfig(config: McpConfig): Promise<McpStatus>;
/**
 * MCP サーバー（Rust）から中継されてくるツール実行要求を購読し、
 * ハンドラーで実行した結果を即座に応答するリスナーを登録する
 */
export declare function listenToolCalls(handler: (event: ToolCallRequestEvent) => Promise<{
    result: any;
    isError?: boolean;
}>): Promise<UnlistenFn>;
