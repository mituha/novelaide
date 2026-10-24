import { invoke } from '@tauri-apps/api/core';
import { DEFAULT_LM_STUDIO_URL } from './modelManager';
import { NOVELAID_AI_TOOLS, ToolDefinition } from '../domain/tools';
import { AgentSessionEvent } from '../types';

export interface ChatMessageParam {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface StreamChatOptions {
  model?: string;
  baseUrl?: string;
  temperature?: number;
  tools?: ToolDefinition[];
  enableTools?: boolean;
  onToken?: (delta: string) => void;
  onThought?: (thought: string) => void;
  signal?: AbortSignal;
}

interface RawToolCallChunk {
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

/**
 * LM Studio / OpenAI互換エンドポイントまたは Tauri IPC に対するストリーミング対話（単一ターン）
 */
export async function streamChat(
  messages: ChatMessageParam[],
  options: StreamChatOptions = {}
): Promise<{
  content: string;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, any> }>;
}> {
  const {
    model = 'lm-studio/qwen2.5-7b-instruct',
    baseUrl = DEFAULT_LM_STUDIO_URL,
    temperature = 0.7,
    tools = NOVELAID_AI_TOOLS,
    enableTools = true,
    onToken,
    signal,
  } = options;

  const endpoint = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  const bodyPayload: Record<string, any> = {
    model,
    messages,
    temperature,
    stream: true,
  };

  if (enableTools && tools && tools.length > 0) {
    bodyPayload.tools = tools;
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
      signal: signal || AbortSignal.timeout(45000),
    });

    if (!res.ok || !res.body) {
      throw new Error(`LM Studio HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullContent = '';
    let buffer = '';

    const accumulatedToolCalls: Map<number, { id: string; name: string; argumentsText: string }> = new Map();

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
            const choice = data.choices?.[0];
            const delta = choice?.delta;

            // テキストトークンの受信
            if (delta?.content) {
              fullContent += delta.content;
              onToken?.(delta.content);
            }

            // ツール呼び出し（Function calling）の逐次チャンク
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls as Array<RawToolCallChunk & { index?: number }>) {
                const idx = tc.index ?? 0;
                if (!accumulatedToolCalls.has(idx)) {
                  accumulatedToolCalls.set(idx, {
                    id: tc.id || `call_${Date.now()}_${idx}`,
                    name: tc.function?.name || '',
                    argumentsText: '',
                  });
                }
                const current = accumulatedToolCalls.get(idx)!;
                if (tc.id && !current.id) current.id = tc.id;
                if (tc.function?.name) current.name += tc.function.name;
                if (tc.function?.arguments) current.argumentsText += tc.function.arguments;
              }
            }
          } catch {
            // パースエラーは無視
          }
        }
      }
    }

    // パース済みのツール呼び出しを構築
    const toolCalls: Array<{ id: string; name: string; arguments: Record<string, any> }> = [];
    accumulatedToolCalls.forEach((val) => {
      let parsedArgs: Record<string, any> = {};
      try {
        if (val.argumentsText) {
          parsedArgs = JSON.parse(val.argumentsText);
        }
      } catch {
        parsedArgs = { raw: val.argumentsText };
      }
      toolCalls.push({
        id: val.id,
        name: val.name,
        arguments: parsedArgs,
      });
    });

    return {
      content: fullContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
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
      return { content: response };
    } catch {
      throw err;
    }
  }
}

export type ToolExecutor = (toolName: string, args: Record<string, any>) => Promise<any>;

export interface AgentTurnOptions extends StreamChatOptions {
  toolExecutor?: ToolExecutor;
  onEvent?: (event: AgentSessionEvent) => void;
  maxToolLoops?: number;
}

/**
 * pi-coding-agent の自律ツール実行ループ（AgentSession）に準拠したセッション実行
 */
export async function runAgentTurn(
  initialMessages: ChatMessageParam[],
  options: AgentTurnOptions = {}
): Promise<{ fullContent: string; history: ChatMessageParam[] }> {
  const {
    toolExecutor,
    onEvent,
    maxToolLoops = 5,
    onToken,
    ...streamOptions
  } = options;

  const history: ChatMessageParam[] = [...initialMessages];
  let loopCount = 0;
  let finalContent = '';

  onEvent?.({
    type: 'message_start',
    role: 'assistant',
    messageId: `msg_${Date.now()}`,
  });

  while (loopCount < maxToolLoops) {
    loopCount++;

    const result = await streamChat(history, {
      ...streamOptions,
      onToken: (token) => {
        onToken?.(token);
        onEvent?.({ type: 'message_update', delta: token });
      },
    });

    finalContent = result.content;

    // ツール呼び出しが発生しなかった場合は終了
    if (!result.toolCalls || result.toolCalls.length === 0 || !toolExecutor) {
      break;
    }

    // ツール呼び出しを履歴に追加（role: assistant）
    history.push({
      role: 'assistant',
      content: result.content,
      tool_calls: result.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      })),
    });

    // 各ツールを順次実行
    for (const tc of result.toolCalls) {
      onEvent?.({
        type: 'tool_call_start',
        toolName: tc.name,
        callId: tc.id,
        args: tc.arguments,
      });

      let toolResult: any;
      try {
        toolResult = await toolExecutor(tc.name, tc.arguments);
      } catch (e: any) {
        toolResult = { error: String(e.message || e) };
      }

      onEvent?.({
        type: 'tool_call_end',
        toolName: tc.name,
        callId: tc.id,
        result: toolResult,
      });

      // ツール結果を履歴に追加（role: tool）
      history.push({
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.name,
        content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
      });
    }

    // 次のループへ（LLM がツールの結果を反映して作家へ最終回答を生成する）
  }

  onEvent?.({
    type: 'turn_end',
    fullContent: finalContent,
  });

  return { fullContent: finalContent, history };
}
