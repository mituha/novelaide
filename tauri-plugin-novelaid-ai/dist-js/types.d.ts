export interface AiModelInfo {
    id: string;
    name: string;
    provider: string;
    contextWindow?: number;
}
export type AiPersonaType = 'partner' | 'editor' | 'proofreader' | 'character';
export interface AiPersona {
    id: AiPersonaType;
    name: string;
    role: string;
    description: string;
    icon?: string;
    systemPrompt?: string;
}
export interface AiChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    persona?: AiPersonaType;
    content: string;
    timestamp: string;
    toolCalls?: Array<{
        name: string;
        params: any;
        result?: any;
    }>;
}
export interface AiToolResult {
    success: boolean;
    target?: string;
    suggestions?: Array<{
        word: string;
        ruby: string;
        line?: number;
    }>;
    issues?: Array<{
        type: string;
        message: string;
        line?: number;
    }>;
    [key: string]: any;
}
