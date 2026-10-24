import { invoke } from '@tauri-apps/api/core';
import { Agent, type AgentEvent, type StreamFn } from '@earendil-works/pi-agent-core';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
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
 * pi-agent-core / pi-ai の AssistantMessageEventStream プロトコルに完全準拠
 */
function createBrowserStreamFn(
  baseUrl: string = DEFAULT_LM_STUDIO_URL,
  defaultModel: string = 'lm-studio/qwen2.5-7b-instruct'
): StreamFn {
  return (modelOrMessages: any, contextOrOptions: any, maybeOptions?: any) => {
    const stream = createAssistantMessageEventStream();

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

    // 非同期でストリーミング通信を開始
    (async () => {
      console.groupCollapsed(`%c[Novelaid AI] リクエスト送信 🚀 (${modelName})`, 'color: #3b82f6; font-weight: bold;');
      console.log('エンドポイント:', endpoint);
      console.log('メッセージ履歴:', apiMessages);
      console.groupEnd();

      const partial: any = { role: 'assistant', content: [{ type: 'text', text: '' }] };
      stream.push({ type: 'start', partial });
      stream.push({ type: 'text_start', contentIndex: 0, partial });

      let receivedTokenCount = 0;
      let fullResponseText = '';

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
          throw new Error(`LM Studio HTTP ${res.status}: ${res.statusText}`);
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
              break;
            }

            try {
              const parsed = JSON.parse(dataStr);
              const choice = parsed.choices?.[0];
              const delta = choice?.delta;

              if (delta?.content) {
                const token = delta.content;
                receivedTokenCount++;
                fullResponseText += token;
                partial.content[0].text = fullResponseText;

                // pi-agent-core 規格: partial を必ず含めて text_delta を送出
                stream.push({
                  type: 'text_delta',
                  contentIndex: 0,
                  delta: token,
                  partial: { ...partial, content: [{ type: 'text', text: fullText(fullResponseText) }] },
                });
              }
            } catch {
              // JSON パースエラーはスキップ
            }
          }
        }

        console.log(
          `%c[Novelaid AI] 受信完了 ✅ (トークン数: ${receivedTokenCount}, 文字数: ${fullResponseText.length})`,
          'color: #10b981; font-weight: bold;',
          '\n応答本文プレビュー:',
          fullResponseText.slice(0, 100) + (fullResponseText.length > 100 ? '...' : '')
        );

        stream.push({ type: 'text_end', contentIndex: 0, partial });
        stream.end({
          role: 'assistant',
          content: [{ type: 'text', text: fullResponseText }],
          stopReason: 'stop',
        });
      } catch (err: any) {
        console.warn(
          `%c[Novelaid AI] LM Studio 通信エラー / オフラインフォールバック ⚠️: ${err.message}`,
          'color: #f59e0b; font-weight: bold;'
        );

        const fallbackText = `\n（※LM Studio への接続が検出されなかったため、ローカル補助モードで動作しています）\n\nご質問を受け付けました。執筆パートナーとして原稿を分析します。`;
        fullResponseText = fallbackText;
        partial.content[0].text = fullResponseText;

        stream.push({
          type: 'text_delta',
          contentIndex: 0,
          delta: fallbackText,
          partial: { ...partial, content: [{ type: 'text', text: fallbackText }] },
        });

        stream.push({ type: 'text_end', contentIndex: 0, partial });
        stream.end({
          role: 'assistant',
          content: [{ type: 'text', text: fullResponseText }],
          stopReason: 'stop',
        });
      }
    })();

    return stream;
  };
}

function fullText(text: string): string {
  return text;
}

/**
 * Pi SDK（pi-agent-core）準拠の執筆エージェントセッション管理クラス
 * ブラウザ/WebView 環境で安全に動作し、送受信ログをリアルタイム出力
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
        console.log('%c[Novelaid AI] ツール実行開始 🔧:', 'color: #8b5cf6;', context.toolName, context.params);
        this.onEvent?.({
          type: 'tool_call_start',
          toolName: context.toolName || 'tool',
          callId: context.callId || `call_${Date.now()}`,
          args: context.params || {},
        });
        return undefined;
      },
      afterToolCall: async (context: any) => {
        console.log('%c[Novelaid AI] ツール実行完了 🔧:', 'color: #8b5cf6;', context.toolName, context.result);
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
        if (event.message?.role === 'assistant' || event.type === 'message_start') {
          this.onEvent?.({
            type: 'message_start',
            role: 'assistant',
            messageId: `msg_${Date.now()}`,
          });
        }
        break;

      case 'message_update':
        const delta = event.assistantMessageEvent?.delta || event.delta || '';
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

      console.log('%c[Novelaid AI] プロンプト実行開始 💬:', 'color: #3b82f6;', promptText.slice(0, 100));
      await (this.agent as any).prompt(promptText);
      return '';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('%c[Novelaid AI] prompt エラー ❌:', 'color: #ef4444;', message);
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
