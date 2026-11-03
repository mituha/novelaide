import { AiModelInfo } from '../types';
import { GOOGLE_MODELS } from '@earendil-works/pi-ai/providers/google.models';
import { invoke } from '@tauri-apps/api/core';

export const DEFAULT_LM_STUDIO_URL = 'http://localhost:1234/v1';
export const GEMINI_OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

/**
 * OS の環境変数から AI プロバイダー専用の API キーを取得（Tauri Rust バックエンド経由・ホワイトリスト制限）
 */
export async function getEnvApiKey(provider: string = 'gemini'): Promise<string | undefined> {
  try {
    const key = await invoke<string | null>('plugin:novelaid-ai|ai_get_env_api_key', { provider });
    return key && key.trim().length > 0 ? key.trim() : undefined;
  } catch (e) {
    console.warn('[modelManager] getEnvApiKey failed or unsupported in browser mode:', e);
    return undefined;
  }
}

export interface ModelFetchOptions {
  lmStudioUrl?: string;
  geminiApiKey?: string;
  providers?: ('lm-studio' | 'gemini')[];
}

/**
 * LM Studio のローカルエンドポイントから現在ロード中/利用可能なモデルを動的取得
 */
export async function fetchLmStudioModels(baseUrl: string = DEFAULT_LM_STUDIO_URL): Promise<AiModelInfo[]> {
  const url = baseUrl.replace(/\/+$/, '') + '/models';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = (await res.json()) as { data?: Array<{ id: string; owned_by?: string }> };
    if (!data.data || data.data.length === 0) {
      return getFallbackLmStudioModels();
    }
    return data.data.map((m) => ({
      id: m.id,
      name: `${m.id} (LM Studio)`,
      provider: 'lm-studio',
      contextWindow: 32768,
    }));
  } catch (e) {
    console.warn('[modelManager] LM Studio models fetch failed:', e);
    return getFallbackLmStudioModels();
  }
}

/**
 * Google Gemini のモデル一覧を pi SDK カタログおよび Google REST API から動的取得
 */
export async function fetchGeminiModels(apiKey?: string): Promise<AiModelInfo[]> {
  let resolvedKey = apiKey && apiKey.trim().length > 0 ? apiKey.trim() : undefined;
  if (!resolvedKey) {
    resolvedKey = await getEnvApiKey('gemini');
  }

  // 1. API キーが提供されている場合、Google API からリアルタイムに最新モデルを取得
  if (resolvedKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${resolvedKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = (await res.json()) as {
          models?: Array<{
            name: string; // e.g. "models/gemini-2.5-flash"
            displayName?: string;
            description?: string;
            inputTokenLimit?: number;
            supportedGenerationMethods?: string[];
          }>;
        };

        if (data.models && data.models.length > 0) {
          // generateContent に対応している gemini モデルを抽出
          const validModels = data.models.filter(
            (m) =>
              m.supportedGenerationMethods?.includes('generateContent') &&
              m.name.includes('gemini')
          );

          if (validModels.length > 0) {
            return validModels.map((m) => {
              const cleanId = m.name.replace(/^models\//, '');
              return {
                id: cleanId,
                name: m.displayName || cleanId,
                provider: 'gemini',
                contextWindow: m.inputTokenLimit || 1048576,
                description: m.description,
              };
            });
          }
        }
      }
    } catch (e) {
      console.warn('[modelManager] Gemini API live models fetch failed, fallback to pi SDK catalog:', e);
    }
  }

  // 2. フォールバックまたは未設定時: pi SDK (@earendil-works/pi-ai) 内蔵の GOOGLE_MODELS カタログから生成
  const piModels: AiModelInfo[] = [];
  try {
    for (const [, m] of Object.entries(GOOGLE_MODELS)) {
      const modelObj = m as any;
      if (modelObj && modelObj.id && modelObj.id.startsWith('gemini')) {
        piModels.push({
          id: modelObj.id,
          name: modelObj.name || modelObj.id,
          provider: 'gemini',
          contextWindow: modelObj.contextWindow || 1048576,
          reasoning: modelObj.reasoning ?? false,
        });
      }
    }
  } catch (err) {
    console.warn('[modelManager] Failed to read GOOGLE_MODELS from pi-ai:', err);
  }

  if (piModels.length > 0) {
    return piModels;
  }

  return getFallbackGeminiModels();
}

/**
 * 指定された設定に基づき、有効な全プロバイダーからモデル一覧を動的取得
 */
export async function fetchAllAvailableModels(options: ModelFetchOptions = {}): Promise<AiModelInfo[]> {
  const providers = options.providers || ['gemini', 'lm-studio'];
  const results: AiModelInfo[] = [];

  const promises: Promise<AiModelInfo[]>[] = [];

  if (providers.includes('gemini')) {
    promises.push(fetchGeminiModels(options.geminiApiKey));
  }
  if (providers.includes('lm-studio')) {
    promises.push(fetchLmStudioModels(options.lmStudioUrl));
  }

  const settled = await Promise.allSettled(promises);
  for (const s of settled) {
    if (s.status === 'fulfilled') {
      results.push(...s.value);
    }
  }

  return results;
}

export function getFallbackLmStudioModels(): AiModelInfo[] {
  return [
    {
      id: 'qwen2.5-7b-instruct',
      name: 'Qwen 2.5 7B Instruct (LM Studio)',
      provider: 'lm-studio',
      contextWindow: 32768,
    },
    {
      id: 'llama-3.1-8b-instruct',
      name: 'Llama 3.1 8B Instruct (LM Studio)',
      provider: 'lm-studio',
      contextWindow: 32768,
    },
  ];
}

export function getFallbackGeminiModels(): AiModelInfo[] {
  return [
    {
      id: 'gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      provider: 'gemini',
      contextWindow: 1048576,
    },
    {
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      provider: 'gemini',
      contextWindow: 1048576,
    },
    {
      id: 'gemini-1.5-flash',
      name: 'Gemini 1.5 Flash',
      provider: 'gemini',
      contextWindow: 1048576,
    },
    {
      id: 'gemini-1.5-pro',
      name: 'Gemini 1.5 Pro',
      provider: 'gemini',
      contextWindow: 1048576,
    },
  ];
}

export function getFallbackModels(): AiModelInfo[] {
  return [...getFallbackGeminiModels(), ...getFallbackLmStudioModels()];
}
