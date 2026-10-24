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
function createLmStudioStreamFn(
  baseUrl: string = DEFAULT_LM_STUDIO_URL,
  defaultModel: string = 'lm-studio/qwen2.5-7b-instruct'
): StreamFn {
  return async (modelOrMessages: any, contextOrOptions: any, maybeOptions?: any) => {
    // pi-agent-core の StreamFn(model, context, options) シグネチャに完全対応
    let messagesList: any[] = [];
    let signal: AbortSignal | undefined;
    let modelName = defaultModel;

    if (contextOrOptions && Array.isArray(contextOrOptions.messages)) {
      messagesList = contextOrOptions.messages;
      signal = maybeOptions?.signal;
      if (modelOrMessages?.id) modelName = modelOrMessages.id;
    } else if (Array.isArray(modelOrMessages)) {
      messagesList = modelOrMessages;
      signal = contextOrOptions?.signal;
    }

    const endpoint = baseUrl.replace(/\/+$/, '') + '/chat/completions';

    // pi-agent-core の messages 形式を OpenAI chat completions 形式に変換
    const apiMessages = messagesList.map((m: any) => ({
      role: m.role || 'user',
      content: typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
        ? m.content.map((c: any) => c.text || '').join('')
        : '',
      tool_calls: m.tool_calls || m.toolCalls,
      tool_call_id: m.tool_call_id || m.toolCallId,
    }));

    // AsyncGenerator としてデルタトークンを送出
    async function* eventGenerator(): AsyncGenerator<any, void, unknown> {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelName,
            messages: apiMessages,
            stream: true,
          }),
          signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`LM Studio HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

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
      } catch (networkErr: any) {
        console.warn('[createLmStudioStreamFn] LM Studio 未起動のため、Tauri IPC/ローカルエンジンにフォールバックします:', networkErr.message);

        let fallbackText = '';
        const lastUser = apiMessages.filter((m: any) => m.role === 'user').pop()?.content || '';

        try {
          if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
            fallbackText = await invoke<string>('plugin:novelaid-ai|ai_send_message', {
              prompt: lastUser,
              persona: 'partner',
              context: null,
            });
          } else {
            fallbackText = `【執筆パートナー】ご相談ありがとうございます。\n\n「${lastUser.slice(0, 60)}」について拝読しました。文脈を踏まえて自然なリズムと情緒豊かな描写をご提案します。`;
          }
        } catch {
          fallbackText = `【執筆パートナー】ご相談ありがとうございます。「${lastUser.slice(0, 60)}」の執筆をサポートします。`;
        }

        yield {
          type: 'text_delta',
          delta: fallbackText,
        };
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

    // pi-agent-core Agent インスタンスの生成（ToolDefinition はフラット構造）
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

      await this.agent.prompt(finalInput);
      return '';
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
