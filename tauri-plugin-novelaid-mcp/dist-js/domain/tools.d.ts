/**
 * novelaid 外部制御および MCP 共通ツール定義
 * (MCP サーバーおよび Pi SDK 互換)
 */
export type ToolPermissionCategory = 'read' | 'write';
export type ToolPermissionLevel = 'none' | 'read' | 'write';
export interface ToolPropertySchema {
    type: string;
    description?: string;
    enum?: string[];
    items?: {
        type: string;
        properties?: Record<string, ToolPropertySchema>;
        required?: string[];
    };
}
export interface ToolDefinition {
    name: string;
    description: string;
    permission: ToolPermissionCategory;
    parameters: {
        type: 'object';
        properties: Record<string, ToolPropertySchema>;
        required?: string[];
    };
}
/**
 * novelaid 共通ツール定義一覧
 */
export declare const NOVELAID_TOOLS: ToolDefinition[];
/**
 * 指定権限レベルでフィルタリングされたツール一覧を取得する
 */
export declare function getFilteredTools(permission: ToolPermissionLevel): ToolDefinition[];
