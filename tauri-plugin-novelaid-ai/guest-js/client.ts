import { invoke } from '@tauri-apps/api/core';
import { AiModelInfo, AiToolResult } from './types';

export const aiClient = {
  isAvailable: async (): Promise<boolean> => {
    try {
      return await invoke<boolean>('plugin:novelaid-ai|ai_is_available');
    } catch {
      return true;
    }
  },

  getModels: async (): Promise<AiModelInfo[]> => {
    try {
      return await invoke<AiModelInfo[]>('plugin:novelaid-ai|ai_get_models');
    } catch {
      return [
        {
          id: 'lm-studio/qwen2.5-7b-instruct',
          name: 'Qwen 2.5 7B Instruct (LM Studio)',
          provider: 'LM Studio',
          contextWindow: 32768,
        },
        {
          id: 'gemini/gemini-1.5-flash',
          name: 'Gemini 1.5 Flash',
          provider: 'Google',
          contextWindow: 1000000,
        },
      ];
    }
  },

  sendMessage: async (
    prompt: string,
    persona: string = 'partner',
    context?: string
  ): Promise<string> => {
    try {
      return await invoke<string>('plugin:novelaid-ai|ai_send_message', {
        prompt,
        persona,
        context,
      });
    } catch {
      // モック応答
      if (persona === 'editor') {
        return `【担当編集者】\nプロローグを拝読しました。冒頭の「青い空の彼方から、一羽の鳥が舞い降りてきた」という導入は静けさの中に予兆を感じさせて引き込まれますね。\n\nより緊迫感を高めるなら、鳥が言葉を発した直後の少年の心拍や息を呑む一瞬の生理描写を少し差し込むと、読者が主人公に強く共感しやすくなりますよ。`;
      } else if (persona === 'proofreader') {
        return `【校正係】\n原稿を確認しました。ルビの書式（|漆黒《しっこく》、|神代玲央《かみしろれお》）は小説投稿サイトおよび文庫形式に準拠しており問題ありません。\n文末の「〜だった」が連続している箇所について、体言止めや感覚描写を交えてリズムに変化をつける推敲を提案できます。`;
      }
      return `【執筆パートナー】\n「${prompt}」について承知しました！\n物語の世界観や登場人物の感情の流れを大切にしながら、より魅力的な描写を一緒に考えていきましょう。`;
    }
  },

  runTool: async (
    toolName: string,
    targetFile?: string,
    params: any = {}
  ): Promise<AiToolResult> => {
    try {
      return await invoke<AiToolResult>('plugin:novelaid-ai|ai_run_tool', {
        toolName,
        targetFile,
        params,
      });
    } catch {
      return {
        success: true,
        target: targetFile,
        suggestions: [
          { word: '漆黒', ruby: 'しっこく', line: 4 },
          { word: '神代玲央', ruby: 'かみしろれお', line: 6 },
        ],
      };
    }
  },
};
