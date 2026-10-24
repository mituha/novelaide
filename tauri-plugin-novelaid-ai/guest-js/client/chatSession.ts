import { invoke } from '@tauri-apps/api/core';
import { Agent, type AgentEvent, type AgentMessage, type StreamFn } from '@earendil-works/pi-agent-core';
import { DEFAULT_LM_STUDIO_URL } from './modelManager';
import { NOVELAID_AI_TOOLS, ToolDefinition } from '../domain/tools';
import { AgentSessionEvent } from '../types';

export interface ChatMessageParam {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export type ToolExecutor = (toolName: string, args: Record<string, any>) => Promise<any>;

export interface PiAgentSessionOptions {
  model?: string;
  baseUrl?: string;
  systemPrompt?: string;
  tools?: ToolDefinition[];
  enableTools?: boolean;
  toolExecutor?: ToolExecutor;
  onEvent?: (event: AgentSessionEvent) => void;
  onToken?: (delta: string) => void;
}

/**
 * LM Studio / OpenAI 互換のエンドポイントに対するカスタム StreamFn
 */
function createLmStudioStreamFn(baseUrl: string = DEFAULT_LM_STUDIO_URL, model: string = 'lm-studio/qwen2.5-7b-instruct'): StreamFn {
  return async (messages, options) => {
    const endpoint = baseUrl.replace(/\/+$/, '') + '/chat/completions';

    // pi-agent-core の messages 形式を OpenAI chat completions 形式に変換
    const apiMessages = messages.map((m: any) => ({
      role: m.role || 'user',
      content: typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map((c: any) => c.text || '').join('') : '',
      tool_calls: m.tool_calls || m.toolCalls,
      tool_call_id: m.tool_call_id || m.toolCallId,
    }));

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        stream: true,
      }),
      signal: options?.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`LM Studio HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    // AsyncGenerator としてデルタトークンを送出
    async function* eventGenerator(): AsyncGenerator<any, void, unknown> {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const delta = data.choices?.[0]?.delta;
              if (delta?.content) {
                yield {
                  type: 'text_delta',
                  delta: delta.content,
                };
              }
            } catch {
              // パースエラーは無視
            }
          }
        }
      }
    }

    return eventGenerator() as any;
  };
}

/**
 * @earendil-works/pi-agent-core の Agent クラスを利用した小説執筆セッション
 */
export class PiWritingAgentSession {
  private agent: Agent;
  private toolExecutor?: ToolExecutor;
  private onEvent?: (event: AgentSessionEvent) => void;
  private onToken?: (delta: string) => void;
  private isGenerating: boolean = false;

  constructor(options: PiAgentSessionOptions = {}) {
    const {
      model = 'lm-studio/qwen2.5-7b-instruct',
      baseUrl = DEFAULT_LM_STUDIO_URL,
      systemPrompt = '小説執筆を支援してください。',
      tools = NOVELAID_AI_TOOLS,
      enableTools = true,
      toolExecutor,
      onEvent,
      onToken,
    } = options;

    this.toolExecutor = toolExecutor;
    this.onEvent = onEvent;
    this.onToken = onToken;

    const streamFunction = createLmStudioStreamFn(baseUrl, model);

    // pi-agent-core Agent インスタンスの生成
    this.agent = new Agent({
      initialState: {
        systemPrompt,
        tools: enableTools ? (tools as any) : undefined,
      },
      streamFn: streamFunction,
      beforeToolCall: async (context) => {
        this.onEvent?.({
          type: 'tool_call_start',
          toolName: (context as any).toolName || 'tool',
          callId: (context as any).callId || `call_${Date.now()}`,
          args: (context as any).params || {},
        });
        return undefined;
      },
      afterToolCall: async (context) => {
        this.onEvent?.({
          type: 'tool_call_end',
          toolName: (context as any).toolName || 'tool',
          callId: (context as any).callId || `call_${Date.now()}`,
          result: (context as any).result,
        });
        return undefined;
      },
    });

    // pi-agent-core イベントの購読
    this.agent.subscribe((event: AgentEvent) => {
      switch ((event as any).type) {
        case 'turn_start':
        case 'message_start':
          this.onEvent?.({
            type: 'message_start',
            role: 'assistant',
            messageId: `msg_${Date.now()}`,
          });
          break;

        case 'message_update':
          const delta = (event as any).delta || (event as any).textDelta || '';
          if (delta) {
            this.onToken?.(delta);
            this.onEvent?.({
              type: 'message_update',
              delta,
            });
          }
          break;

        case 'turn_end':
          this.onEvent?.({
            type: 'turn_end',
            fullContent: (event as any).content || '',
          });
          break;
      }
    });
  }

  /**
   * 作家からのプロンプトを投入してターンを実行
   */
  public async prompt(userText: string, contextContent?: string): Promise<string> {
    if (this.isGenerating) {
      throw new Error('現在エージェントが応答中です');
    }
    this.isGenerating = true;

    try {
      let finalInput = userText;
      if (contextContent && contextContent.trim()) {
        finalInput = `【参照原稿・設定資料コンテキスト】\n${contextContent}\n【作家からの質問・指示】\n${userText}`;
      }

      // ツール呼び出しが発生した場合に備え、Tauri IPC へのフォールバック等もカバー
      let accumulatedResponse = '';

      // pi-agent-core の prompt 呼び出し
      try {
        await this.agent.prompt(finalInput);
      } catch (agentErr) {
        // LM Studio が未起動の場合、Tauri IPC コマンドにフォールバック
        const fallbackRes = await invoke<string>('plugin:novelaid-ai|ai_send_message', {
          prompt: finalInput,
          persona: 'partner',
        });
        this.onToken?.(fallbackRes);
        accumulatedResponse = fallbackRes;
      }

      return accumulatedResponse;
    } finally {
      this.isGenerating = false;
    }
  }

  public abort(): void {
    this.agent.abort();
    this.isGenerating = false;
  }
}

/**
 * 簡易対話実行ヘルパー
 */
export async function runAgentTurn(
  initialMessages: ChatMessageParam[],
  options: PiAgentSessionOptions = {}
): Promise<{ fullContent: string; history: ChatMessageParam[] }> {
  const session = new PiWritingAgentSession(options);
  const lastUserMsg = initialMessages.filter((m) => m.role === 'user').pop()?.content || '';
  const result = await session.prompt(lastUserMsg);
  return {
    fullContent: result,
    history: [...initialMessages, { role: 'assistant', content: result }],
  };
}
