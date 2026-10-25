import { Agent, type AgentEvent, type StreamFn } from '@earendil-works/pi-agent-core';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import { DEFAULT_LM_STUDIO_URL } from './modelManager';
import { Persona, AgentSessionEvent } from '../types';
import { getPersonaPrompt } from '../domain/guidelines';
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
  baseUrl?: string;
  persona?: Persona;
  contextContent?: string;
  uiDocumentContext?: UIDocumentContext;
  toolProxy?: NovelaidToolProxy;
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

                // pi-agent-core 規格: partial を付与して text_delta を送出
                stream.push({
                  type: 'text_delta',
                  contentIndex: 0,
                  delta: token,
                  partial: { ...partial, content: [{ type: 'text', text: fullResponseText }] },
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

/**
 * Pi SDK（Extension / registerTool / registerCommand）準拠の執筆エージェントセッション管理クラス
 */
export class PiWritingAgentSession {
  private agent: Agent | null = null;
  private options: PiAgentSessionOptions;
  private onEvent?: (event: AgentSessionEvent) => void;
  private onToken?: (delta: string) => void;
  private unsubscribe?: () => void;

  // Extension レジストリ
  public readonly registeredTools = new Map<string, ExtensionToolDefinition>();
  public readonly registeredCommands = new Map<string, ExtensionCommandDefinition>();
  private readonly eventHandlers = new Map<string, Function[]>();

  constructor(options: PiAgentSessionOptions = {}) {
    this.options = options;
    this.onEvent = options.onEvent;
    this.onToken = options.onToken;
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

    const novelaidExt = createNovelaidExtension({
      lmStudioUrl: baseUrl,
      persona: this.options.persona,
      contextContent: this.options.contextContent,
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

    const persona = this.options.persona || 'partner';
    const personaPrompt = getPersonaPrompt(persona);
    let systemPrompt = personaPrompt;
    if (systemPromptOptions.sections['novelaid_persona']) {
      systemPrompt = systemPromptOptions.sections['novelaid_persona'];
    }
    if (systemPromptOptions.sections['novelaid_context']) {
      systemPrompt += `\n\n${systemPromptOptions.sections['novelaid_context']}`;
    } else if (this.options.contextContent && this.options.contextContent.trim().length > 0) {
      systemPrompt += `\n\n【現在エディターで参照中の原稿・設定資料コンテキスト】\n${this.options.contextContent.trim()}\n※上記の原稿・資料を最優先で考慮して回答してください。`;
    }

    const streamFn = createBrowserStreamFn(baseUrl, modelId);

    // 3. Extension から登録されたツール配列（registerTool）を取得
    const toolsForAgent = Array.from(this.registeredTools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    console.log(
      '%c[Novelaid AI] Extension ツール・コマンド登録完了 ⚙️:',
      'color: #10b981;',
      `ツール数: ${toolsForAgent.length}, コマンド数: ${this.registeredCommands.size}`
    );

    // 4. pi-agent-core Agent インスタンスの生成
    this.agent = new Agent({
      initialState: {
        systemPrompt,
        tools: toolsForAgent as any,
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
