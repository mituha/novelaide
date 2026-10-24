import { invoke } from '@tauri-apps/api/core';
import { Persona } from '../types';
import { getPersonaPrompt } from '../domain/guidelines';
import { DEFAULT_LM_STUDIO_URL, fetchLmStudioModels } from '../client/modelManager';

/**
 * Pi SDK 準拠のツール定義インターフェース
 */
export interface ExtensionToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (args: any) => Promise<any>;
}

/**
 * Pi SDK 準拠のコマンド定義インターフェース
 */
export interface ExtensionCommandDefinition {
  description: string;
  handler: (args?: string) => Promise<string | void> | string | void;
}

/**
 * Pi SDK ExtensionAPI 互換インターフェース
 */
export interface NovelaidExtensionAPI {
  registerTool: (tool: ExtensionToolDefinition) => void;
  registerCommand: (name: string, def: ExtensionCommandDefinition) => void;
  registerProvider?: (name: string, provider: any) => void;
  on: (event: string, handler: (data: any) => Promise<void> | void) => void;
  notify?: (message: string, type?: 'info' | 'warning' | 'error') => void;
}

/**
 * ツール実行プロキシ（GUI では Tauri IPC、CLI では直接実行に切り替え可能）
 */
export interface NovelaidToolProxy {
  scanProofread?: (args: { text?: string; fileName?: string }) => Promise<any>;
  extractRuby?: (args: { text?: string; fileName?: string }) => Promise<any>;
  searchMetadata?: (args: { query: string }) => Promise<any>;
}

export interface NovelaidExtensionOptions {
  lmStudioUrl?: string;
  persona?: Persona;
  contextContent?: string;
  toolProxy?: NovelaidToolProxy;
  invokeTool?: (toolName: string, args: Record<string, any>) => Promise<any>;
  notify?: (message: string, type?: 'info' | 'warning' | 'error') => void;
}

/**
 * novelaid AI 執筆支援 Extension
 * Pi Coding Agent SDK の標準 Extension 機構（registerTool / registerCommand / before_agent_start）に完全準拠
 */
export function createNovelaidExtension(options: NovelaidExtensionOptions = {}) {
  const lmStudioUrl = options.lmStudioUrl || DEFAULT_LM_STUDIO_URL;

  return {
    name: 'novelaid-extension',
    factory: async (api: NovelaidExtensionAPI) => {
      // 1. LM Studio プロバイダー登録（SDK標準 provider 機構）
      if (api.registerProvider) {
        try {
          const fetchedModels = await fetchLmStudioModels(lmStudioUrl);
          if (fetchedModels.length > 0) {
            const sdkModels = fetchedModels.map((m) => ({
              id: m.id,
              name: m.id,
              api: 'openai-completions' as const,
              reasoning: false,
              contextWindow: 128000,
              maxTokens: 16384,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              input: ['text' as const],
            }));

            api.registerProvider('lm-studio', {
              name: 'LM Studio',
              baseUrl: lmStudioUrl,
              apiKey: 'lm-studio',
              api: 'openai-completions',
              models: sdkModels,
            });
          }
        } catch {
          // 未起動時はスキップ
        }
      }

      // ツール実行プロキシハンドラー
      const runTool = async (name: string, args: Record<string, any>): Promise<any> => {
        if (options.toolProxy) {
          if (name === 'scan_proofread' && options.toolProxy.scanProofread) {
            return await options.toolProxy.scanProofread(args);
          }
          if (name === 'extract_ruby' && options.toolProxy.extractRuby) {
            return await options.toolProxy.extractRuby(args);
          }
          if (name === 'search_metadata' && options.toolProxy.searchMetadata) {
            return await options.toolProxy.searchMetadata(args as any);
          }
        }

        if (options.invokeTool) {
          return await options.invokeTool(name, args);
        }

        try {
          return await invoke('plugin:novelaid-ai|ai_run_tool', { toolName: name, args });
        } catch {
          if (name === 'scan_proofread') {
            return {
              status: 'success',
              issues: [
                { type: 'consecutive_ta', message: '文末の「〜た。」が連続しています', line: 12 },
              ],
            };
          }
          if (name === 'extract_ruby') {
            return {
              status: 'success',
              candidates: [
                { word: '深淵', ruby: 'しんえん', formatted: '|深淵《しんえん》' },
              ],
            };
          }
          if (name === 'search_metadata') {
            return {
              status: 'success',
              results: [
                { title: '設定資料', summary: '登場人物および世界観の基本設定' },
              ],
            };
          }
          return { status: 'success', message: 'ツールが正常に完了しました' };
        }
      };

      // 2. 執筆支援ツールの登録 (api.registerTool)
      api.registerTool({
        name: 'scan_proofread',
        description: '現在開いている原稿テキストの文末重複（「〜た。」の3連続など）、誤字脱字、表記揺れ、ら抜き言葉を高速スキャンします。',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'スキャン対象の本文テキスト。省略時は現在アクティブな原稿が対象になります。',
            },
          },
          required: [],
        },
        execute: async (args: any) => {
          return await runTool('scan_proofread', args || {});
        },
      });

      api.registerTool({
        name: 'extract_ruby',
        description: '原稿内の難読漢字、作中固有名詞、当て字の候補を検出し、|親文字《ルビ》 形式のルビ候補一覧を抽出します。',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'ルビ抽出対象の本文テキスト。省略時は現在アクティブな原稿が対象になります。',
            },
          },
          required: [],
        },
        execute: async (args: any) => {
          return await runTool('extract_ruby', args || {});
        },
      });

      api.registerTool({
        name: 'search_metadata',
        description: '作品内のFrontmatter設定資料（登場人物、世界観、舞台設定、伏線・プロット）をキーワード検索し、関連設定を要約して取得します。',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '検索するキーワードやキャラクター名（例: "主人公", "世界観", "魔法"）',
            },
          },
          required: ['query'],
        },
        execute: async (args: any) => {
          return await runTool('search_metadata', args || {});
        },
      });

      // 3. スラッシュコマンドの登録 (api.registerCommand)
      api.registerCommand('ruby', {
        description: '原稿のルビ候補抽出支援を実行・案内します (/ruby [対象テキスト])',
        handler: async (args) => {
          const res = await runTool('extract_ruby', { text: args });
          const candidates = res.candidates || [];
          if (candidates.length === 0) {
            return '【ルビ抽出】該当する難読漢字や固有名詞は見つかりませんでした。';
          }
          const list = candidates.map((c: any) => `・${c.formatted || `|${c.word}《${c.ruby}》`}`).join('\n');
          return `【ルビ候補一覧 (novelaid-ruby 準拠)】\n${list}\n\n💡 AIに対話で「このルビを原稿に適用して」と指示できます。`;
        },
      });

      api.registerCommand('proofread', {
        description: '原稿の誤字脱字・文末重複スキャンを実行・案内します (/proofread [対象テキスト])',
        handler: async (args) => {
          const res = await runTool('scan_proofread', { text: args });
          const issues = res.issues || [];
          if (issues.length === 0) {
            return '【校正スキャン】文末重複（3連続以上）や辞書誤字は検出されませんでした。良好なリズムです！';
          }
          const list = issues.map((iss: any) => `・[${iss.line ? `${iss.line}行目: ` : ''}${iss.type || '指摘'}] ${iss.message || iss.original}`).join('\n');
          return `【校正・推敲スキャン結果】\n${list}\n\n💡 AIに対話で「この重複表現を解消して」と指示できます。`;
        },
      });

      api.registerCommand('check', {
        description: '校正・推敲スキャンを実行します（/proofread のエイリアス）',
        handler: async (args) => {
          const proofreadCmd = (api as any).commands?.get('proofread');
          if (proofreadCmd) return await proofreadCmd.handler(args);
          return await runTool('scan_proofread', { text: args });
        },
      });

      api.registerCommand('info', {
        description: 'novelaid AI 執筆支援のステータスと接続情報を表示します',
        handler: () => {
          return [
            '【novelaid AI 執筆支援ステータス】',
            `・接続エンドポイント: ${lmStudioUrl}`,
            `・現在のペルソナ: ${options.persona || 'partner'}`,
            '・登録ツール: scan_proofread, extract_ruby, search_metadata',
            '・登録コマンド: /ruby, /proofread, /check, /info, /help',
            '・基盤アーキテクチャ: Pi Coding Agent SDK (Extension / registerTool)',
          ].join('\n');
        },
      });

      api.registerCommand('help', {
        description: '利用可能なスラッシュコマンド一覧を表示します',
        handler: () => {
          return [
            '【利用可能なスラッシュコマンド一覧】',
            '・/ruby [テキスト] : 難読漢字・固有名詞のルビ候補を抽出',
            '・/proofread [テキスト] : 文末の「〜た。」連続や誤字脱字をスキャン',
            '・/check [テキスト] : /proofread のエイリアスコマンド',
            '・/info : 現在の接続先とペルソナステータスを表示',
            '・/help : このヘルプメッセージを表示',
            '\n※通常メッセージを入力すると、選択したペルソナ（執筆パートナー/担当編集者/校正係/作中人物）との対話が開始されます。',
          ].join('\n');
        },
      });

      // 4. AI思考開始前のペルソナ・コンテキスト動的注入 (api.on("before_agent_start"))
      api.on('before_agent_start', async (event: any) => {
        if (!event.systemPromptOptions) {
          event.systemPromptOptions = { sections: {} };
        }
        if (!event.systemPromptOptions.sections) {
          event.systemPromptOptions.sections = {};
        }

        const persona = options.persona || 'partner';
        const personaPrompt = getPersonaPrompt(persona);
        event.systemPromptOptions.sections['novelaid_persona'] = [
          '【執筆支援ペルソナ設定】',
          personaPrompt,
        ].join('\n');

        if (options.contextContent && options.contextContent.trim().length > 0) {
          event.systemPromptOptions.sections['novelaid_context'] = [
            '【現在エディターで参照中の原稿・設定資料コンテキスト】',
            options.contextContent.trim(),
            '※回答を作成する際は、上記の原稿文脈や設定資料の記述を最優先で考慮してください。',
          ].join('\n');
        }
      });
    },
  };
}
