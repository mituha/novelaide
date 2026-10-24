import { AiModelInfo } from '../types';

export const DEFAULT_LM_STUDIO_URL = 'http://localhost:1234/v1';

export async function fetchLmStudioModels(baseUrl: string = DEFAULT_LM_STUDIO_URL): Promise<AiModelInfo[]> {
  const url = baseUrl.replace(/\/+$/, '') + '/models';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = (await res.json()) as { data?: Array<{ id: string; owned_by?: string }> };
    if (!data.data || data.data.length === 0) {
      return getFallbackModels();
    }
    return data.data.map((m) => ({
      id: m.id,
      name: m.id,
      provider: 'LM Studio',
      contextWindow: 32768,
    }));
  } catch {
    return getFallbackModels();
  }
}

export function getFallbackModels(): AiModelInfo[] {
  return [
    {
      id: 'lm-studio/qwen2.5-7b-instruct',
      name: 'Qwen 2.5 7B Instruct (LM Studio)',
      provider: 'LM Studio',
      contextWindow: 32768,
    },
    {
      id: 'gemini/gemini-1.5-flash',
      name: 'Gemini 1.5 Flash (Google)',
      provider: 'Google',
      contextWindow: 1000000,
    },
  ];
}
