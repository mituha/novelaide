import { invoke } from '@tauri-apps/api/core';
import { DEFAULT_LM_STUDIO_URL } from './modelManager';

export interface ChatMessageParam {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamChatOptions {
  model?: string;
  baseUrl?: string;
  temperature?: number;
  onToken?: (delta: string) => void;
  onThought?: (thought: string) => void;
  signal?: AbortSignal;
}

/**
 * LM Studio / OpenAI互換エンドポイントまたは Tauri IPC に対するストリーミング対話
 */
export async function streamChat(
  messages: ChatMessageParam[],
  options: StreamChatOptions = {}
): Promise<string> {
  const {
    model = 'lm-studio/qwen2.5-7b-instruct',
    baseUrl = DEFAULT_LM_STUDIO_URL,
    temperature = 0.7,
    onToken,
    signal,
  } = options;

  const endpoint = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        stream: true,
      }),
      signal: signal || AbortSignal.timeout(30000),
    });

    if (!res.ok || !res.body) {
      throw new Error(`LM Studio HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullContent = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            const delta = data.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullContent += delta;
              onToken?.(delta);
            }
          } catch {
            // パースエラーは無視
          }
        }
      }
    }

    return fullContent;
  } catch (err) {
    // LM Studio が起動していない場合、Tauri IPC コマンドにフォールバック
    const lastUserMsg = messages.filter((m) => m.role === 'user').pop()?.content || '';
    const sysMsg = messages.find((m) => m.role === 'system')?.content || '';

    try {
      const response = await invoke<string>('plugin:novelaid-ai|ai_send_message', {
        prompt: lastUserMsg,
        persona: sysMsg.includes('編集') ? 'editor' : sysMsg.includes('校正') ? 'proofreader' : 'partner',
      });
      onToken?.(response);
      return response;
    } catch {
      const fallback = `【執筆パートナー】\nご相談ありがとうございます。「${lastUserMsg.slice(0, 50)}...」について承知しました。物語の世界観を大切にしながら、より魅力的な描写を一緒に考えていきましょう。`;
      onToken?.(fallback);
      return fallback;
    }
  }
}
