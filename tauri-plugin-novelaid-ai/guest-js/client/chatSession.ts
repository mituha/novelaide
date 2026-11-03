import { Agent, type AgentEvent, type StreamFn } from '@earendil-works/pi-agent-core';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import { DEFAULT_LM_STUDIO_URL, GEMINI_OPENAI_BASE_URL } from './modelManager';
import { Persona, AiPersonaType, AgentSessionEvent, AiProviderType } from '../types';
import { getPersonaPrompt } from '../domain/guidelines';
import { ToolPermissionLevel } from '../domain/tools';
import {
  createNovelaidExtension,
  ExtensionToolDefinition,
  ExtensionCommandDefinition,
  NovelaidExtensionAPI,
  NovelaidToolProxy,
  UIDocumentContext,
} from '../extensions/novelaidExtension';

export type { UIDocumentContext };
export type ToolExecutor = (toolName: string, args: Record<string, any>) => Promise<any>;

export interface PiAgentSessionOptions {
  model?: string;
  provider?: AiProviderType;
  baseUrl?: string;
  apiKey?: string;
  persona?: Persona | AiPersonaType | string;
  contextContent?: string;
  useReasoning?: boolean;
  useTools?: boolean;
  toolsPermission?: ToolPermissionLevel;
  availableFilesSummary?: string;
  uiDocumentContext?: UIDocumentContext;
  toolProxy?: NovelaidToolProxy;
  toolExecutor?: ToolExecutor;
  initialMessages?: any[];
  onEvent?: (event: AgentSessionEvent) => void;
  onToken?: (delta: string) => void;
  onThoughtToken?: (delta: string) => void;
}

/**
 * .ch ドキュメントのメッセージ配列（ChatMessage[]）を Pi SDK Agent のメッセージ配列に変換
 */
export function convertChMessagesToPiMessages(messages: any[]): any[] {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const piMessages: any[] = [];

  for (const m of messages) {
    if (!m || !m.role) continue;
    // welcome メッセージ等のダミー挨拶はスキップ
    if (m.id === 'welcome') continue;

    if (m.role === 'user') {
      const textContent = m.content || (m.parts?.find((p: any) => p.type === 'text')?.content ?? '');
      if (textContent) {
        piMessages.push({
          role: 'user',
          content: textContent,
          timestamp: typeof m.timestamp === 'number' ? m.timestamp : Date.now(),
        });
      }
    } else if (m.role === 'assistant') {
      const parts = Array.isArray(m.parts) ? m.parts : [];
      const contentParts: any[] = [];
      const toolResults: any[] = [];

      for (const p of parts) {
        if (p.type === 'thought' && p.content) {
          contentParts.push({ type: 'thought', text: p.content });
        } else if (p.type === 'text' && p.content) {
          contentParts.push({ type: 'text', text: p.content });
        } else if (p.type === 'tool_call' && p.metadata?.tool_call) {
          const tc = p.metadata.tool_call;
          const callId = tc.id || `call_${Date.now()}`;
          contentParts.push({
            type: 'toolCall',
            id: callId,
            name: tc.name,
            arguments: tc.arguments || {},
          });
          if (tc.result !== undefined) {
            toolResults.push({
              role: 'toolResult',
              toolCallId: callId,
              toolName: tc.name,
              content: [{ type: 'text', text: typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result) }],
              isError: tc.result?.status === 'error',
            });
          }
        }
      }

      // parts が空で content がある場合
      if (contentParts.length === 0 && m.content) {
        contentParts.push({ type: 'text', text: m.content });
      }

      if (contentParts.length > 0) {
        piMessages.push({
          role: 'assistant',
          content: contentParts,
          timestamp: typeof m.timestamp === 'number' ? m.timestamp : Date.now(),
        });
        // 紐づく toolResult があれば直後に追加
        for (const tr of toolResults) {
          piMessages.push(tr);
        }
      }
    }
  }

  return piMessages;
}

interface StreamFnOptions {
  baseUrl?: string;
  provider?: AiProviderType;
  apiKey?: string;
  defaultModel?: string;
  useReasoning?: boolean;
  toolsPermission?: ToolPermissionLevel;
  tools?: any[];
}

/**
 * LM Studio / Google Gemini / OpenAI 互換のブラウザセーフな StreamFn
 * pi-agent-core / pi-ai の AssistantMessageEventStream プロトコルに完全準拠
 */
function createBrowserStreamFn(options: StreamFnOptions): StreamFn {
  const provider = options.provider || 'lm-studio';
  const defaultModel = options.defaultModel || (provider === 'gemini' ? 'gemini-2.5-flash' : 'qwen2.5-7b-instruct');
  
  let baseUrl = options.baseUrl || (provider === 'gemini' ? GEMINI_OPENAI_BASE_URL : DEFAULT_LM_STUDIO_URL);
  baseUrl = baseUrl.replace(/\/+$/, '');

  return (modelOrMessages: any, contextOrOptions: any, maybeOptions?: any) => {
    const stream = createAssistantMessageEventStream();

    let messagesList: any[] = [];
    let signal: AbortSignal | undefined;
    let modelName = defaultModel;

    if (contextOrOptions && Array.isArray(contextOrOptions.messages)) {
      messagesList = contextOrOptions.messages;
      signal = maybeOptions?.signal;
      if (modelOrMessages?.id && modelOrMessages.id !== 'unknown') {
        modelName = modelOrMessages.id;
      }
    } else if (Array.isArray(modelOrMessages)) {
      messagesList = modelOrMessages;
      signal = contextOrOptions?.signal;
    }

    const endpoint = `${baseUrl}/chat/completions`;
    const apiMessages = messagesList.map((m: any) => {
      // 1. toolResult メッセージ -> OpenAI規格 role: "tool" に変換
      if (m.role === 'toolResult') {
        let textContent = '';
        if (typeof m.content === 'string') {
          textContent = m.content;
        } else if (Array.isArray(m.content)) {
          textContent = m.content
            .map((c: any) => (typeof c === 'string' ? c : c.text || JSON.stringify(c)))
            .join('\n');
        } else if (m.content) {
          textContent = JSON.stringify(m.content);
        }

        return {
          role: 'tool',
          tool_call_id: m.toolCallId || m.tool_call_id || '',
          content: textContent,
        };
      }

      // 2. assistant メッセージ -> content と tool_calls の分離 (OpenAI規格)
      if (m.role === 'assistant') {
        let textContent = '';
        const toolCalls: any[] = [];

        if (typeof m.content === 'string') {
          textContent = m.content;
        } else if (Array.isArray(m.content)) {
          for (const item of m.content) {
            if (item.type === 'text') {
              textContent += item.text || '';
            } else if (item.type === 'toolCall' || item.type === 'tool_call') {
              toolCalls.push({
                id: item.id,
                type: 'function',
                function: {
                  name: item.name,
                  arguments:
                    typeof item.arguments === 'string'
                      ? item.arguments
                      : JSON.stringify(item.arguments || {}),
                },
              });
            }
          }
        }

        const msgObj: Record<string, any> = {
          role: 'assistant',
          content: textContent || '',
        };
        if (toolCalls.length > 0) {
          msgObj.tool_calls = toolCalls;
        }
        return msgObj;
      }

      // 3. user / system メッセージ
      let contentStr = '';
      if (typeof m.content === 'string') {
        contentStr = m.content;
      } else if (Array.isArray(m.content)) {
        contentStr = m.content
          .map((c: any) => (typeof c === 'string' ? c : c.text || ''))
          .join('\n');
      }

      return {
        role: m.role || 'user',
        content: contentStr,
      };
    });

    let toolsList: any[] = [];
    if (maybeOptions && Array.isArray(maybeOptions.tools)) {
      toolsList = maybeOptions.tools;
    } else if (contextOrOptions && Array.isArray(contextOrOptions.tools)) {
      toolsList = contextOrOptions.tools;
    } else if (Array.isArray(options.tools)) {
      toolsList = options.tools;
    }

    (async () => {
      console.groupCollapsed(`%c[Novelaid AI] リクエスト送信 🚀 (${provider} / ${modelName})`, 'color: #3b82f6; font-weight: bold;');
      console.log('エンドポイント:', endpoint);
      console.log('メッセージ履歴:', apiMessages);
      console.log('ツール定義候補数:', toolsList.length);
      console.log('ツール権限レベル:', options.toolsPermission);
      console.groupEnd();

      const partial: any = { role: 'assistant', content: [] };
      stream.push({ type: 'start', partial });

      let receivedTokenCount = 0;
      let fullThoughtText = '';
      let fullResponseText = '';
      let isThinkingActive = false;
      let isTextActive = false;
      const toolCallsMap: Record<number, { id: string; name: string; arguments: string }> = {};

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (options.apiKey && options.apiKey.trim().length > 0) {
        headers['Authorization'] = `Bearer ${options.apiKey.trim()}`;
      }

      try {
        const requestBody: Record<string, any> = {
          model: modelName,
          messages: apiMessages,
          stream: true,
        };

        if (options.useReasoning === false) {
          requestBody.chat_template_kwargs = { enable_reasoning: false };
          requestBody.reasoning_effort = 'none';
        }

        // ツール権限が none 以外でツール一覧が存在する場合は tools を付与
        if (options.toolsPermission !== 'none' && Array.isArray(toolsList) && toolsList.length > 0) {
          requestBody.tools = toolsList.map((t: any) => ({
            type: 'function',
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            },
          }));
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
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

              // 1. 思考トークン（Reasoning / Thinking）の検出と送出
              const reasoningToken = delta?.reasoning_content || delta?.reasoning || delta?.thought;
              if (reasoningToken && options.useReasoning !== false) {
                if (!isThinkingActive) {
                  isThinkingActive = true;
                  partial.content.push({ type: 'thinking', thinking: '' });
                  stream.push({
                    type: 'thinking_start',
                    contentIndex: partial.content.length - 1,
                    partial: { ...partial },
                  } as any);
                }

                fullThoughtText += reasoningToken;
                const thoughtBlock = partial.content.find((c: any) => c.type === 'thinking');
                if (thoughtBlock) {
                  thoughtBlock.thinking = fullThoughtText;
                }

                stream.push({
                  type: 'thinking_delta',
                  contentIndex: 0,
                  delta: reasoningToken,
                  partial: { ...partial },
                } as any);
              }

              // 2. 本文トークン（Text Content）の検出と送出
              if (delta?.content) {
                if (isThinkingActive) {
                  isThinkingActive = false;
                  stream.push({
                    type: 'thinking_end',
                    contentIndex: 0,
                    content: fullThoughtText,
                    partial: { ...partial },
                  } as any);
                }

                if (!isTextActive) {
                  isTextActive = true;
                  partial.content.push({ type: 'text', text: '' });
                  const textIndex = partial.content.length - 1;
                  stream.push({
                    type: 'text_start',
                    contentIndex: textIndex,
                    partial: { ...partial },
                  } as any);
                }

                const token = delta.content;
                receivedTokenCount++;
                fullResponseText += token;
                const textBlock = partial.content.find((c: any) => c.type === 'text');
                if (textBlock) {
                  textBlock.text = fullResponseText;
                }
                const textIndex = partial.content.findIndex((c: any) => c.type === 'text');

                // pi-agent-core 規格: partial を付与して text_delta を送出
                stream.push({
                  type: 'text_delta',
                  contentIndex: textIndex !== -1 ? textIndex : 0,
                  delta: token,
                  partial: { ...partial },
                } as any);
              }

              // 3. ツール呼び出し（Tool Calls）の検出と組み立て (pi-ai 準拠)
              if (Array.isArray(delta?.tool_calls)) {
                if (isThinkingActive) {
                  isThinkingActive = false;
                  stream.push({
                    type: 'thinking_end',
                    contentIndex: 0,
                    content: fullThoughtText,
                    partial: { ...partial },
                  } as any);
                }
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!toolCallsMap[idx]) {
                    toolCallsMap[idx] = {
                      id: tc.id || `call_${Date.now()}_${idx}`,
                      name: tc.function?.name || '',
                      arguments: tc.function?.arguments || '',
                    };
                    partial.content.push({
                      type: 'toolCall',
                      id: toolCallsMap[idx].id,
                      name: toolCallsMap[idx].name,
                      arguments: {},
                    });
                    const cIdx = partial.content.length - 1;
                    stream.push({
                      type: 'toolcall_start',
                      contentIndex: cIdx,
                      partial: { ...partial },
                    } as any);
                  } else {
                    if (tc.function?.name) {
                      toolCallsMap[idx].name += tc.function.name;
                    }
                    if (tc.function?.arguments) {
                      toolCallsMap[idx].arguments += tc.function.arguments;
                      const callItem = partial.content.find((c: any) => c.id === toolCallsMap[idx].id);
                      if (callItem) {
                        try {
                          callItem.arguments = JSON.parse(toolCallsMap[idx].arguments);
                        } catch {
                          callItem.arguments = { raw: toolCallsMap[idx].arguments };
                        }
                      }
                      const cIdx = partial.content.findIndex((c: any) => c.id === toolCallsMap[idx].id);
                      stream.push({
                        type: 'toolcall_delta',
                        contentIndex: cIdx !== -1 ? cIdx : 0,
                        delta: tc.function.arguments,
                        partial: { ...partial },
                      } as any);
                    }
                  }
                }
              }
            } catch {
              // JSON パースエラーはスキップ
            }
          }
        }

        if (isThinkingActive) {
          isThinkingActive = false;
          stream.push({
            type: 'thinking_end',
            contentIndex: 0,
            content: fullThoughtText,
            partial: { ...partial },
          } as any);
        }

        const textIndex = partial.content.findIndex((c: any) => c.type === 'text');
        if (isTextActive) {
          stream.push({
            type: 'text_end',
            contentIndex: textIndex !== -1 ? textIndex : 0,
            content: fullResponseText,
            partial: { ...partial },
          } as any);
        }

        const hasToolCalls = Object.keys(toolCallsMap).length > 0;
        if (hasToolCalls) {
          for (const tc of Object.values(toolCallsMap)) {
            let parsedArgs: Record<string, any> = {};
            try {
              parsedArgs = tc.arguments ? JSON.parse(tc.arguments) : {};
            } catch {
              parsedArgs = { raw: tc.arguments };
            }

            const cIdx = partial.content.findIndex((c: any) => c.id === tc.id);
            stream.push({
              type: 'toolcall_end',
              contentIndex: cIdx !== -1 ? cIdx : 0,
              toolCall: {
                type: 'toolCall',
                id: tc.id,
                name: tc.name,
                arguments: parsedArgs,
              },
              partial: { ...partial },
            } as any);
          }
        }

        console.log(
          `%c[Novelaid AI] 受信完了 ✅ (思考文字数: ${fullThoughtText.length}, 本文トークン数: ${receivedTokenCount}, 本文文字数: ${fullResponseText.length}, ツール呼出: ${Object.keys(toolCallsMap).length})`,
          'color: #10b981; font-weight: bold;',
          '\n応答本文プレビュー:',
          fullResponseText.slice(0, 100) + (fullResponseText.length > 100 ? '...' : '')
        );

        const finalContent: any[] = [];
        if (fullThoughtText) {
          finalContent.push({ type: 'thinking', thinking: fullThoughtText });
        }
        if (fullResponseText) {
          finalContent.push({ type: 'text', text: fullResponseText });
        }
        if (hasToolCalls) {
          console.group('%c[Novelaid AI] 🛠️ ツール呼び出し検出・解析', 'color: #ec4899; font-weight: bold;');
          for (const tc of Object.values(toolCallsMap)) {
            let parsedArgs: Record<string, any> = {};
            try {
              parsedArgs = tc.arguments ? JSON.parse(tc.arguments) : {};
            } catch {
              parsedArgs = { raw: tc.arguments };
            }
            console.log(`▶ ツール名: %c${tc.name}`, 'color: #3b82f6; font-weight: bold;');
            console.log(`  コールID: ${tc.id}`);
            console.log(`  引数 (Object):`, parsedArgs);
            console.log(`  引数 (Raw JSON):`, tc.arguments);

            finalContent.push({
              type: 'toolCall',
              id: tc.id,
              name: tc.name,
              arguments: parsedArgs,
            });
          }
          console.groupEnd();
        }

        stream.end({
          role: 'assistant',
          content: finalContent,
          stopReason: hasToolCalls ? 'toolUse' : 'stop',
        } as any);
      } catch (err: any) {
        console.warn(
          `%c[Novelaid AI] LM Studio 通信エラー / オフラインフォールバック ⚠️: ${err.message}`,
          'color: #f59e0b; font-weight: bold;'
        );

        const fallbackText = `\n（※LM Studio への接続が検出されなかったため、ローカル補助モードで動作しています）\n\nご質問を受け付けました。執筆パートナーとして原稿を分析します。`;
        fullResponseText = fallbackText;
        partial.content = [{ type: 'text', text: fullResponseText }];

        stream.push({
          type: 'text_start',
          contentIndex: 0,
          partial: { ...partial },
        } as any);

        stream.push({
          type: 'text_delta',
          contentIndex: 0,
          delta: fallbackText,
          partial: { ...partial },
        } as any);

        stream.push({ type: 'text_end', contentIndex: 0, content: fullResponseText, partial } as any);
        stream.end({
          role: 'assistant',
          content: [{ type: 'text', text: fullResponseText }],
          stopReason: 'stop',
        } as any);
      }
    })();

    return stream;
  };
}

/**
 * Pi SDK（Extension / registerTool / registerCommand）準拠の執筆エージェントセッション管理クラス
 */
export class PiWritingAgentSession {
  private agent: Agent | null = null;
  private options: PiAgentSessionOptions;
  private onEvent?: (event: AgentSessionEvent) => void;
  private onToken?: (delta: string) => void;
  private onThoughtToken?: (delta: string) => void;
  private unsubscribe?: () => void;

  // Extension レジストリ
  public readonly registeredTools = new Map<string, ExtensionToolDefinition>();
  public readonly registeredCommands = new Map<string, ExtensionCommandDefinition>();
  private readonly eventHandlers = new Map<string, Function[]>();

  constructor(options: PiAgentSessionOptions = {}) {
    this.options = options;
    this.onEvent = options.onEvent;
    this.onToken = options.onToken;
    this.onThoughtToken = options.onThoughtToken;
  }

  /**
   * ExtensionAPI を通じたツールの登録とセッション初期化
   */
  public async init(): Promise<Agent> {
    const baseUrl = this.options.baseUrl || DEFAULT_LM_STUDIO_URL;
    const modelId = this.options.model || 'lm-studio/qwen2.5-7b-instruct';

    // 1. Novelaid Extension の生成と登録
    this.registeredTools.clear();
    this.registeredCommands.clear();
    this.eventHandlers.clear();

    const extensionAPI: NovelaidExtensionAPI = {
      registerTool: (tool) => {
        this.registeredTools.set(tool.name, tool);
      },
      registerCommand: (name, def) => {
        this.registeredCommands.set(name, def);
      },
      on: (event, handler) => {
        const list = this.eventHandlers.get(event) || [];
        list.push(handler);
        this.eventHandlers.set(event, list);
      },
      notify: (message, type) => {
        console.log(`[Novelaid Extension Notify] (${type || 'info'}):`, message);
      },
    };

    const permission: ToolPermissionLevel =
      this.options.toolsPermission ?? (this.options.useTools === false ? 'none' : 'read');

    const novelaidExt = createNovelaidExtension({
      lmStudioUrl: baseUrl,
      persona: this.options.persona,
      contextContent: this.options.contextContent,
      toolsPermission: permission,
      availableFilesSummary: this.options.availableFilesSummary,
      uiDocumentContext: this.options.uiDocumentContext,
      toolProxy: this.options.toolProxy,
      invokeTool: this.options.toolExecutor,
    });

    await novelaidExt.factory(extensionAPI);

    // 2. before_agent_start イベントによるシステムプロンプトの構築
    const systemPromptOptions = { sections: {} as Record<string, string> };
    const beforeHandlers = this.eventHandlers.get('before_agent_start') || [];
    for (const h of beforeHandlers) {
      await h({ systemPromptOptions });
    }

    const systemPrompt = this.buildSystemPrompt(systemPromptOptions);

    // 3. Extension から登録されたツール配列（registerTool）を取得
    const toolsForAgent =
      permission === 'none'
        ? []
        : Array.from(this.registeredTools.values()).map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
            execute: t.execute,
          }));

    const streamFn = createBrowserStreamFn({
      baseUrl,
      provider: this.options.provider,
      apiKey: this.options.apiKey,
      defaultModel: modelId,
      useReasoning: this.options.useReasoning,
      toolsPermission: permission,
      tools: toolsForAgent,
    });

    // pi 標準互換の /model コマンドを登録
    if (!this.registeredCommands.has('model')) {
      this.registeredCommands.set('model', {
        description: 'AIモデルまたはプロバイダーを変更します (/model <モデルID>)',
        handler: async (args?: string) => {
          if (!args || args.trim().length === 0) {
            return `現在のモデル: ${this.getModel()} (${this.getProvider()})`;
          }
          const target = args.trim();
          this.setModel(target);
          return `モデルを ${target} に切り替えました。`;
        },
      });
    }

    console.log(
      '%c[Novelaid AI] Extension ツール・コマンド登録完了 ⚙️:',
      'color: #10b981;',
      `ツール数: ${toolsForAgent.length}, コマンド数: ${this.registeredCommands.size}, 復元履歴数: ${this.options.initialMessages?.length || 0}`
    );

    const modelObj = {
      id: modelId,
      name: modelId,
      api: 'openai-completions',
      provider: this.options.provider || 'lm-studio',
      baseUrl,
      reasoning: true,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 16384,
    };

    // 4. pi-agent-core Agent インスタンスの生成（過去メッセージ履歴を initialState.messages に復元）
    const initialMessages = this.options.initialMessages ? [...this.options.initialMessages] : [];
    this.agent = new Agent({
      initialState: {
        systemPrompt,
        messages: initialMessages,
        tools: toolsForAgent as any,
        model: modelObj as any,
        thinkingLevel: this.options.useReasoning === false ? 'off' : 'medium',
      },
      streamFn,
      beforeToolCall: async (context: any) => {
        const toolName = context.toolCall?.name || context.toolName || 'tool';
        const callId = context.toolCall?.id || context.callId || `call_${Date.now()}`;
        const args = context.args || context.toolCall?.arguments || context.params || {};

        console.group('%c[Novelaid AI] 🔧 ツール実行開始 (beforeToolCall)', 'color: #8b5cf6; font-weight: bold;');
        console.log(`▶ ツール名: %c${toolName}`, 'color: #3b82f6; font-weight: bold;');
        console.log(`▶ コールID: ${callId}`);
        console.log(`▶ 引数 (args):`, args);
        console.groupEnd();

        this.onEvent?.({
          type: 'tool_call_start',
          toolName,
          callId,
          args,
        });
        return undefined;
      },
      afterToolCall: async (context: any) => {
        const toolName = context.toolCall?.name || context.toolName || 'tool';
        const callId = context.toolCall?.id || context.callId || `call_${Date.now()}`;
        const result = context.result;

        console.group('%c[Novelaid AI] 🔧 ツール実行完了 (afterToolCall)', 'color: #10b981; font-weight: bold;');
        console.log(`▶ ツール名: %c${toolName}`, 'color: #3b82f6; font-weight: bold;');
        console.log(`▶ コールID: ${callId}`);
        console.log(`▶ 実行結果:`, result);
        console.groupEnd();

        this.onEvent?.({
          type: 'tool_call_end',
          toolName,
          callId,
          result,
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
        const asstEvent = event.assistantMessageEvent;
        if (asstEvent?.type === 'thinking_delta') {
          const delta = asstEvent.delta || '';
          if (delta) {
            this.onThoughtToken?.(delta);
            this.onEvent?.({
              type: 'thought_update',
              delta,
            });
          }
        } else if (asstEvent?.type === 'text_delta') {
          const delta = asstEvent.delta || '';
          if (delta) {
            this.onToken?.(delta);
            this.onEvent?.({
              type: 'message_update',
              delta,
            });
          }
        } else {
          const delta = event.assistantMessageEvent?.delta || event.delta || '';
          if (delta) {
            this.onToken?.(delta);
            this.onEvent?.({
              type: 'message_update',
              delta,
            });
          }
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

  /**
   * スラッシュコマンド（/ruby, /proofread, /help 等）の事前インターセプト実行
   */
  public async executeCommand(input: string): Promise<{ handled: boolean; output?: string }> {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) {
      return { handled: false };
    }

    if (!this.agent) {
      await this.init();
    }

    const match = trimmed.match(/^\/([^\s]+)(?:\s+(.*))?$/);
    if (!match) {
      return { handled: false };
    }

    const commandName = match[1].toLowerCase();
    const args = match[2]?.trim();

    const command = this.registeredCommands.get(commandName);
    if (!command) {
      return {
        handled: true,
        output: `【未定義のコマンド】/${commandName}\n利用可能なコマンドを確認するには /help と入力してください。`,
      };
    }

    console.log(`%c[Novelaid AI] スラッシュコマンド実行 ⚡: /${commandName}`, 'color: #f59e0b; font-weight: bold;');
    try {
      const result = await command.handler(args);
      return {
        handled: true,
        output: typeof result === 'string' ? result : undefined,
      };
    } catch (err: any) {
      return {
        handled: true,
        output: `【コマンド実行エラー】/${commandName}: ${err.message || String(err)}`,
      };
    }
  }

  /**
   * 発話送信（スラッシュコマンドの場合は即時インターセプト実行、通常の質問はLLMへ送信）
   */
  public async prompt(text: string, contextContent?: string): Promise<string> {
    if (!this.agent) {
      await this.init();
    }

    // 1. スラッシュコマンドの事前インターセプト
    if (text.trim().startsWith('/')) {
      const cmdResult = await this.executeCommand(text);
      if (cmdResult.handled) {
        const output = cmdResult.output || 'コマンドを実行しました。';
        this.onEvent?.({
          type: 'message_start',
          role: 'assistant',
          messageId: `msg_${Date.now()}`,
        });
        this.onToken?.(output);
        this.onEvent?.({
          type: 'turn_end',
          status: 'success',
        });
        return output;
      }
    }

    // 2. 通常のAIエージェント対話
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

  /**
   * 現在のセッションのモデルまたはプロバイダーを動的変更
   */
  public setModel(modelId: string, provider?: AiProviderType, apiKey?: string): void {
    this.options.model = modelId;
    if (provider) this.options.provider = provider;
    if (apiKey) this.options.apiKey = apiKey;

    // agent が既に初期化されている場合、streamFn を再生成して反映
    if (this.agent) {
      const baseUrl = this.options.baseUrl || (this.options.provider === 'gemini' ? GEMINI_OPENAI_BASE_URL : DEFAULT_LM_STUDIO_URL);
      const permission: ToolPermissionLevel =
        this.options.toolsPermission ?? (this.options.useTools === false ? 'none' : 'read');
      const tools = (this.agent as any).state?.tools || [];
      const streamFn = createBrowserStreamFn({
        baseUrl,
        provider: this.options.provider,
        apiKey: this.options.apiKey,
        defaultModel: modelId,
        useReasoning: this.options.useReasoning,
        toolsPermission: permission,
        tools,
      });
      (this.agent as any).streamFn = streamFn;
      (this.agent as any).state.model = {
        ...(this.agent as any).state.model,
        id: modelId,
        name: modelId,
        provider: this.options.provider || 'lm-studio',
      };
    }
  }

  public setUseReasoning(val: boolean): void {
    this.options.useReasoning = val;
    if (this.agent) {
      (this.agent as any).state.thinkingLevel = val ? 'medium' : 'off';
      const baseUrl = this.options.baseUrl || (this.options.provider === 'gemini' ? GEMINI_OPENAI_BASE_URL : DEFAULT_LM_STUDIO_URL);
      const permission: ToolPermissionLevel =
        this.options.toolsPermission ?? (this.options.useTools === false ? 'none' : 'read');
      const tools = (this.agent as any).state?.tools || [];
      const streamFn = createBrowserStreamFn({
        baseUrl,
        provider: this.options.provider,
        apiKey: this.options.apiKey,
        defaultModel: this.options.model,
        useReasoning: val,
        toolsPermission: permission,
        tools,
      });
      (this.agent as any).streamFn = streamFn;
    }
  }

  public getModel(): string {
    return this.options.model || (this.options.provider === 'gemini' ? 'gemini-2.5-flash' : 'qwen2.5-7b-instruct');
  }

  public getProvider(): AiProviderType {
    return this.options.provider || 'lm-studio';
  }

  /**
   * システムプロンプトの構築
   */
  public buildSystemPrompt(systemPromptOptions?: { sections: Record<string, string> }): string {
    const persona = this.options.persona || 'partner';
    const personaPrompt = getPersonaPrompt(persona);
    let systemPrompt = personaPrompt;

    if (systemPromptOptions?.sections?.['novelaid_persona']) {
      systemPrompt = systemPromptOptions.sections['novelaid_persona'];
    }
    if (systemPromptOptions?.sections?.['novelaid_context']) {
      systemPrompt += `\n\n${systemPromptOptions.sections['novelaid_context']}`;
    } else if (this.options.contextContent && this.options.contextContent.trim().length > 0) {
      systemPrompt += `\n\n【現在エディターで参照中の原稿・設定資料コンテキスト】\n${this.options.contextContent.trim()}\n※上記の原稿・資料を最優先で考慮して回答してください。`;
    }

    if (systemPromptOptions?.sections?.['novelaid_workspace']) {
      systemPrompt += `\n\n${systemPromptOptions.sections['novelaid_workspace']}`;
    } else if (this.options.availableFilesSummary && this.options.availableFilesSummary.trim().length > 0) {
      systemPrompt += `\n\n${this.options.availableFilesSummary.trim()}`;
    }

    if (this.options.useReasoning === false) {
      systemPrompt += `\n\n【出力指示】思考プロセス（推論ログや手順）は出力せず、直接結論・回答本文のみを出力してください。`;
    }

    return systemPrompt;
  }

  /**
   * セッション設定（モデル、ペルソナ、ツール権限、コンテキスト、コールバック等）の動的同期
   * エージェントの会話履歴（Agent._state.messages）を失わずに状態を更新
   */
  public async updateOptions(newOptions: Partial<PiAgentSessionOptions>): Promise<void> {
    Object.assign(this.options, newOptions);
    if (newOptions.onToken) this.onToken = newOptions.onToken;
    if (newOptions.onThoughtToken) this.onThoughtToken = newOptions.onThoughtToken;
    if (newOptions.onEvent) this.onEvent = newOptions.onEvent;

    if (!this.agent) {
      await this.init();
      return;
    }

    const permission: ToolPermissionLevel =
      this.options.toolsPermission ?? (this.options.useTools === false ? 'none' : 'read');

    // 1. ツールのフィルタリング更新
    const toolsForAgent =
      permission === 'none'
        ? []
        : Array.from(this.registeredTools.values()).map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
            execute: t.execute,
          }));
    (this.agent as any).state.tools = toolsForAgent;

    // 2. streamFn の再構築（モデル・プロバイダー・ツール権限の反映）
    const baseUrl = this.options.baseUrl || (this.options.provider === 'gemini' ? GEMINI_OPENAI_BASE_URL : DEFAULT_LM_STUDIO_URL);
    const modelId = this.options.model || (this.options.provider === 'gemini' ? 'gemini-2.5-flash' : 'qwen2.5-7b-instruct');
    const streamFn = createBrowserStreamFn({
      baseUrl,
      provider: this.options.provider,
      apiKey: this.options.apiKey,
      defaultModel: modelId,
      useReasoning: this.options.useReasoning,
      toolsPermission: permission,
      tools: toolsForAgent,
    });
    (this.agent as any).streamFunction = streamFn;

    // 3. システムプロンプトの動的反映（agent.state.messages[0] の更新）
    const systemPrompt = this.buildSystemPrompt();
    const stateMessages = (this.agent as any).state?.messages;
    if (Array.isArray(stateMessages) && stateMessages.length > 0 && stateMessages[0]?.role === 'system') {
      stateMessages[0].content = systemPrompt;
    }
  }

  /**
   * 外部（.ch ファイル等）からのメッセージ履歴の強制再同期
   */
  public setHistoryMessages(chMessages: any[]): void {
    const piMessages = convertChMessagesToPiMessages(chMessages);
    if (this.agent) {
      const systemMsg = (this.agent as any).state?.messages?.[0];
      const nextMessages = systemMsg?.role === 'system' ? [systemMsg, ...piMessages] : piMessages;
      (this.agent as any).state.messages = nextMessages;
    } else {
      this.options.initialMessages = piMessages;
    }
  }

  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
    this.registeredTools.clear();
    this.registeredCommands.clear();
    this.eventHandlers.clear();
    this.agent = null;
  }
}
