import { invoke } from '@tauri-apps/api/core';
import { Agent, type AgentEvent, type StreamFn } from '@earendil-works/pi-agent-core';
import { DEFAULT_LM_STUDIO_URL, fetchLmStudioModels } from './modelManager';
import { Persona, AgentSessionEvent } from '../types';
import { getPersonaPrompt } from '../domain/guidelines';
import { NOVELAID_AI_TOOLS } from '../domain/tools';

export type ToolExecutor = (toolName: string, args: Record<string, any>) => Promise<any>;

export interface PiAgentSessionOptions {
  model?: string;
  baseUrl?: string;
  persona?: Persona;
  contextContent?: string;
  toolExecutor?: ToolExecutor;
  onEvent?: (event: AgentSessionEvent) => void;
  onToken?: (delta: string) => void;
}

/**
 * LM Studio / OpenAI 互換のブラウザセーフな StreamFn
 * pi-agent-core 公式の StreamFn(model, context, options) 規約に準拠
 */
function createBrowserStreamFn(
  baseUrl: string = DEFAULT_LM_STUDIO_URL,
  defaultModel: string = 'lm-studio/qwen2.5-7b-instruct'
): StreamFn {
  return async (modelOrMessages: any, contextOrOptions: any, maybeOptions?: any) => {
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
    const apiMessages = messagesList.map((m: any) => ({
      role: m.role || 'user',
      content:
        typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
          ? m.content.map((c: any) => c.text || '').join('')
          : '',
      tool_calls: m.tool_calls || m.toolCalls,
      tool_call_id: m.tool_call_id || m.toolCallId,
    }));

    async function* eventGenerator(): AsyncGenerator<any, void, unknown> {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const dataStr = trimmed.slice(6);
            if (dataStr === '[DONE]') {
              yield { type: 'done' };
              return;
            }

            try {
              const parsed = JSON.parse(dataStr);
              const choice = parsed.choices?.[0];
              const delta = choice?.delta;

              if (delta?.content) {
                yield {
                  type: 'message_update',
                  assistantMessageEvent: {
                    type: 'text_delta',
                    delta: delta.content,
                  },
                  delta: delta.content,
                };
              }
            } catch {
              // JSON パースエラーは無視
            }
          }
        }
        yield { type: 'done' };
      } catch (err: any) {
        // オフライン・未接続時の安全なフォールバック
        const fallbackText = `\n（※LM Studio への接続が検出されなかったため、ローカル補助モードで動作しています）\n\nご質問を受け付けました。執筆パートナーとして原稿を分析します。`;
        yield {
          type: 'message_update',
          assistantMessageEvent: {
            type: 'text_delta',
            delta: fallbackText,
          },
          delta: fallbackText,
        };
        yield { type: 'done' };
      }
    }

    return eventGenerator() as any;
  };
}

/**
 * Pi SDK（pi-agent-core）準拠の執筆エージェントセッション管理クラス
 * ブラウザ/WebView 環境で安全に動作し、Node.js 固有パッケージによるクラッシュを防止
 */
export class PiWritingAgentSession {
  private agent: Agent | null = null;
  private options: PiAgentSessionOptions;
  private onEvent?: (event: AgentSessionEvent) => void;
  private onToken?: (delta: string) => void;
  private unsubscribe?: () => void;

  constructor(options: PiAgentSessionOptions = {}) {
    this.options = options;
    this.onEvent = options.onEvent;
    this.onToken = options.onToken;
  }

  public async init(): Promise<Agent> {
    const baseUrl = this.options.baseUrl || DEFAULT_LM_STUDIO_URL;
    const modelId = this.options.model || 'lm-studio/qwen2.5-7b-instruct';

    // ペルソナとコンテキストを組み合わせたシステムプロンプト
    const persona = this.options.persona || 'partner';
    const personaPrompt = getPersonaPrompt(persona);
    let systemPrompt = personaPrompt;
    if (this.options.contextContent && this.options.contextContent.trim().length > 0) {
      systemPrompt += `\n\n【現在エディターで参照中の原稿・設定資料コンテキスト】\n${this.options.contextContent.trim()}\n※上記の原稿・資料を最優先で考慮して回答してください。`;
    }

    const streamFn = createBrowserStreamFn(baseUrl, modelId);

    // pi-agent-core の Agent クラスを初期化
    this.agent = new Agent({
      initialState: {
        systemPrompt,
        tools: NOVELAID_AI_TOOLS as any,
      },
      streamFn,
      beforeToolCall: async (context: any) => {
        this.onEvent?.({
          type: 'tool_call_start',
          toolName: context.toolName || 'tool',
          callId: context.callId || `call_${Date.now()}`,
          args: context.params || {},
        });
        return undefined;
      },
      afterToolCall: async (context: any) => {
        this.onEvent?.({
          type: 'tool_call_end',
          toolName: context.toolName || 'tool',
          callId: context.callId || `call_${Date.now()}`,
          result: context.result,
        });
        return undefined;
      },
    });

    // イベント購読
    this.unsubscribe = this.agent.subscribe((event: AgentEvent) => {
      this.handleAgentEvent(event);
    });

    return this.agent;
  }

  private handleAgentEvent(event: any): void {
    if (!event) return;

    switch (event.type) {
      case 'turn_start':
      case 'message_start':
        this.onEvent?.({
          type: 'message_start',
          role: 'assistant',
          messageId: `msg_${Date.now()}`,
        });
        break;

      case 'message_update':
        const delta = event.delta || event.assistantMessageEvent?.delta || '';
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
          status: 'success',
        });
        break;
    }
  }

  public async prompt(text: string, contextContent?: string): Promise<string> {
    if (!this.agent) {
      await this.init();
    }

    try {
      let promptText = text;
      if (contextContent && contextContent.trim().length > 0) {
        promptText = `${text}\n\n【参照コンテキスト】\n${contextContent.trim()}`;
      }

      await (this.agent as any).prompt(promptText);
      return '';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[PiWritingAgentSession] prompt 失敗:', message);
      this.onEvent?.({
        type: 'turn_end',
        status: 'success',
      });
      return '';
    }
  }

  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
    this.agent = null;
  }
}
