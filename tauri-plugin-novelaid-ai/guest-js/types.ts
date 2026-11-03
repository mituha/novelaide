export type AiProviderType = 'lm-studio' | 'gemini' | 'openai' | string;

export interface AiModelInfo {
  id: string;
  name: string;
  provider: AiProviderType;
  contextWindow?: number;
  description?: string;
  reasoning?: boolean;
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

export type Persona = AiPersona;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  persona?: AiPersonaType;
  content: string;
  thoughts?: string;
  timestamp: string;
  toolCallId?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
    result?: any;
    status?: 'calling' | 'done' | 'error';
  }>;
}

export interface AIContextState {
  includeLeftActive: boolean;
  includeRightActive: boolean;
  includeAllOpen: boolean;
  customPaths: string[];
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
    text?: string;
    suggestion?: string;
  }>;
  [key: string]: any;
}

/**
 * pi-coding-agent 互換のストリーミングイベント定義
 */
export type AgentSessionEvent =
  | { type: 'message_start'; role: 'assistant' | 'tool'; messageId: string }
  | { type: 'message_update'; delta: string }
  | { type: 'tool_call_start'; toolName: string; callId: string; args: Record<string, any> }
  | { type: 'tool_call_end'; toolName: string; callId: string; result: any }
  | { type: 'turn_end'; fullContent?: string; status?: 'success' | 'error' }
  | { type: 'error'; error: string };
