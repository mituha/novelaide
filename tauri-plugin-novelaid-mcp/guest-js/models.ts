export type McpPermissionLevel = 'read' | 'write';

export interface McpConfig {
  enabled: boolean;
  port: number;
  permission: McpPermissionLevel;
}

export interface McpStatus {
  isRunning: boolean;
  port: number;
  permission: McpPermissionLevel;
  clientCount: number;
}

export interface ToolCallRequestEvent {
  callId: string;
  toolName: string;
  arguments: Record<string, any>;
}

export interface ToolCallResponsePayload {
  callId: string;
  result: any;
  isError: boolean;
}
