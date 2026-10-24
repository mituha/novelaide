import {
  createAgentSession,
  ModelRuntime,
  type AgentSession,
} from '@earendil-works/pi-coding-agent';
import { DEFAULT_LM_STUDIO_URL, fetchLmStudioModels } from './modelManager';
import { createNovelaidExtension } from '../extensions/novelaidExtension';
import { Persona, AgentSessionEvent } from '../types';

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
 * Pi SDK 標準準拠の執筆エージェントセッション管理クラス
 * 上位側での自前ストリーミングやツールループを全廃し、createAgentSession と InlineExtension に一本化
 */
export class PiWritingAgentSession {
  private session: AgentSession | null = null;
  private runtime: ModelRuntime | null = null;
  private options: PiAgentSessionOptions;
  private onEvent?: (event: AgentSessionEvent) => void;
  private onToken?: (delta: string) => void;
  private unsubscribe?: () => void;

  constructor(options: PiAgentSessionOptions = {}) {
    this.options = options;
    this.onEvent = options.onEvent;
    this.onToken = options.onToken;
  }

  /**
   * ModelRuntime と AgentSession の初期化
   */
  public async init(): Promise<AgentSession> {
    const baseUrl = this.options.baseUrl || DEFAULT_LM_STUDIO_URL;
    const modelId = this.options.model || 'lm-studio/qwen2.5-7b-instruct';

    // 1. ModelRuntime の初期化
    let runtime: ModelRuntime;
    try {
      runtime = await ModelRuntime.create({
        allowModelNetwork: true,
      });
    } catch {
      // フォールバック
      runtime = new (ModelRuntime as any)();
    }
    this.runtime = runtime;

    // 2. LM Studio モデルの取得とプロバイダー登録
    let availableModels: any[] = [];
    try {
      const fetched = await fetchLmStudioModels(baseUrl);
      if (fetched.length > 0) {
        availableModels = fetched.map((m) => ({
          id: m.id,
          name: m.id,
          api: 'openai-completions' as const,
          reasoning: false,
          contextWindow: 128000,
          maxTokens: 16384,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          input: ['text' as const],
        }));

        runtime.registerProvider('lm-studio', {
          name: 'LM Studio',
          baseUrl,
          apiKey: 'lm-studio',
          api: 'openai-completions',
          models: availableModels,
        });
      }
    } catch {
      // LM Studio 未接続時はダミーモデルを登録
      availableModels = [
        {
          id: modelId,
          name: modelId,
          api: 'openai-completions' as const,
          reasoning: false,
          contextWindow: 128000,
          maxTokens: 16384,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          input: ['text' as const],
        },
      ];
      runtime.registerProvider('lm-studio', {
        name: 'LM Studio',
        baseUrl,
        apiKey: 'lm-studio',
        api: 'openai-completions',
        models: availableModels,
      });
    }

    const selectedModel =
      availableModels.find((m) => m.id === modelId) || availableModels[0];

    // 3. Novelaid Extension の生成
    const novelaidExt = createNovelaidExtension({
      lmStudioUrl: baseUrl,
      persona: this.options.persona,
      contextContent: this.options.contextContent,
      invokeTool: this.options.toolExecutor,
    });

    // 4. Pi SDK 標準の createAgentSession でセッション作成
    const { session } = await createAgentSession({
      modelRuntime: runtime,
      model: selectedModel,
      inlineExtensions: [novelaidExt],
    });

    this.session = session;

    // 5. イベント購読の接続
    this.unsubscribe = (session as any).subscribe((event: any) => {
      this.handleSdkEvent(event);
    });

    return session;
  }

  /**
   * SDK標準イベントを UI 向けイベントに変換
   */
  private handleSdkEvent(event: any): void {
    if (!event) return;

    switch (event.type) {
      case 'message_start':
        if (event.message?.role === 'assistant') {
          this.onEvent?.({
            type: 'message_start',
            role: 'assistant',
            messageId: event.message?.id || `msg_${Date.now()}`,
          });
        }
        break;

      case 'message_update':
        if (event.assistantMessageEvent?.type === 'text_delta') {
          const delta = event.assistantMessageEvent.delta || '';
          if (delta) {
            this.onToken?.(delta);
            this.onEvent?.({
              type: 'message_update',
              delta,
            });
          }
        }
        break;

      case 'tool_call_start':
        this.onEvent?.({
          type: 'tool_call_start',
          toolName: event.toolName || event.name || 'tool',
          callId: event.callId || event.id || `call_${Date.now()}`,
          args: event.params || event.args || {},
        });
        break;

      case 'tool_call_end':
        this.onEvent?.({
          type: 'tool_call_end',
          toolName: event.toolName || event.name || 'tool',
          callId: event.callId || event.id || `call_${Date.now()}`,
          result: event.result,
        });
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
   * ユーザーからの発話送信（AgentSession に委譲）
   */
  public async prompt(text: string, contextContent?: string): Promise<string> {
    if (!this.session) {
      await this.init();
    }

    try {
      // コンテキスト内容があればプロンプト末尾またはシステム文脈に付加
      let finalPrompt = text;
      if (contextContent && contextContent.trim().length > 0) {
        finalPrompt = `${text}\n\n【参照コンテキスト】\n${contextContent.trim()}`;
      }

      await (this.session as any).prompt(finalPrompt);
      return '';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[PiWritingAgentSession] LM Studio 直接通信失敗、フォールバック実行:', message);

      // オフライン・エラー時の安全なフォールバック
      const fallbackToken = `\n（※LM Studio への接続が検出されなかったため、ローカル補助モードで応答しています）\n\nご質問「${text}」を受け付けました。執筆ペルソナ「${this.options.persona || 'partner'}」として、原稿の改善をサポートします。`;
      this.onToken?.(fallbackToken);
      this.onEvent?.({
        type: 'turn_end',
        status: 'success',
      });
      return fallbackToken;
    }
  }

  /**
   * セッションの破棄
   */
  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
    this.session = null;
    this.runtime = null;
  }
}
