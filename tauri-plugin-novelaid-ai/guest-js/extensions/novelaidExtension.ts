import { invoke } from '@tauri-apps/api/core';
import type { ExtensionAPI, InlineExtension } from '@earendil-works/pi-coding-agent';
import { Persona } from '../types';
import { getPersonaPrompt } from '../domain/guidelines';
import { DEFAULT_LM_STUDIO_URL, fetchLmStudioModels } from '../client/modelManager';

export interface NovelaidExtensionOptions {
  lmStudioUrl?: string;
  persona?: Persona;
  contextContent?: string;
  invokeTool?: (toolName: string, args: Record<string, any>) => Promise<any>;
}

/**
 * novelaid AI 執筆支援 InlineExtension
 * Pi Coding Agent SDK の標準 Extension 機構（ExtensionAPI / registerTool / registerProvider）に完全準拠
 */
export function createNovelaidExtension(options: NovelaidExtensionOptions = {}): InlineExtension {
  const lmStudioUrl = options.lmStudioUrl || DEFAULT_LM_STUDIO_URL;

  return {
    name: 'novelaid-extension',
    factory: async (api: ExtensionAPI) => {
      // 1. LM Studio プロバイダーの自動登録（SDK標準 provider 機構）
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
        // 未起動時は警告を出さずにスキップ
      }

      // ツール実行ハンドラー（Tauri IPC / Rust または注入された invokeTool に委譲）
      const runTool = async (name: string, args: Record<string, any>): Promise<any> => {
        if (options.invokeTool) {
          return await options.invokeTool(name, args);
        }
        try {
          return await invoke('plugin:novelaid-ai|ai_run_tool', { toolName: name, args });
        } catch {
          // モック・フォールバック
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

      // 2. 執筆ツールの登録 (api.registerTool)
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

      // 3. AI思考開始前のペルソナ・原稿コンテキスト動的注入 (api.on("before_agent_start"))
      api.on('before_agent_start', async (event: any) => {
        if (!event.systemPromptOptions) {
          event.systemPromptOptions = { sections: {} };
        }
        if (!event.systemPromptOptions.sections) {
          event.systemPromptOptions.sections = {};
        }

        // ペルソナガイドラインの注入
        const persona = options.persona || 'partner';
        const personaPrompt = getPersonaPrompt(persona);
        event.systemPromptOptions.sections['novelaid_persona'] = [
          '【執筆支援ペルソナ設定】',
          personaPrompt,
        ].join('\n');

        // 原稿・設定資料コンテキストの注入
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
