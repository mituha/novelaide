import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDocument } from '../../contexts/DocumentContext';
import { useSettings } from 'restar-app-settings';
import { fileService } from '../../services/fileService';
import {
  ChFileStructure,
  ChatMessage,
  ChatMessagePart,
  DEFAULT_STATIC_PERSONAS,
} from './ChatTypes';
import { ChatHeader } from './ChatHeader';
import { ChatMessageList } from './ChatMessageList';
import { AIChatInput } from './AIChatInput';
import { PiWritingAgentSession, UIDocumentContext } from 'tauri-plugin-novelaid-ai-api';
import './ChatView.css';

interface ChatViewProps {
  content?: string;
  path?: string;
  baseName?: string;
  onChangeContent?: (newContent: string) => void;
  isReadOnly?: boolean;
  onExportToFile?: () => void;
  showExportButton?: boolean;
  isExporting?: boolean;
}

const formatTimestamp = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const h = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  return `${y}${m}${day}${h}${min}${s}`;
};

// 初期の空ドキュメント用ファクトリ
function createDefaultStructure(fallbackTitle?: string): ChFileStructure {
  const now = formatTimestamp();
  return {
    version: '1.0',
    metadata: {
      title: fallbackTitle || 'AI執筆相談',
      createdAt: now,
      updatedAt: now,
      defaultPersonaId: 'partner',
      defaultRoleId: 'assistant',
      parameters: {
        useTools: true,
        useReasoning: true,
      },
    },
    messages: [
      {
        id: 'welcome',
        role: 'assistant',
        persona: 'partner',
        content: 'こんにちは！執筆パートナーです。プロットの構想やセリフの推敲、ルビ振りなど何でもお気軽にご相談ください。',
        parts: [
          {
            type: 'text',
            content: 'こんにちは！執筆パートナーです。プロットの構想やセリフの推敲、ルビ振りなど何でもお気軽にご相談ください。',
          },
        ],
        timestamp: now,
      },
    ],
  };
}

/**
 * 読み込んだ生のJSONや旧形式データを安全に ChFileStructure に正規化する
 */
function normalizeChData(raw: any, fallbackTitle?: string): ChFileStructure {
  const defaultStruct = createDefaultStructure(fallbackTitle);
  if (!raw || typeof raw !== 'object') {
    return defaultStruct;
  }

  // 以前のチャットデータ形式（単なるメッセージ配列 []）の救済
  if (Array.isArray(raw)) {
    return {
      ...defaultStruct,
      messages: raw.length > 0 ? raw : defaultStruct.messages,
    };
  }

  const metadata = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {};
  const messages = Array.isArray(raw.messages) ? raw.messages : defaultStruct.messages;

  return {
    version: typeof raw.version === 'string' ? raw.version : '1.0',
    metadata: {
      title: metadata.title || fallbackTitle || 'AI執筆相談',
      createdAt: metadata.createdAt || defaultStruct.metadata.createdAt,
      updatedAt: metadata.updatedAt || defaultStruct.metadata.updatedAt,
      defaultPersonaId: metadata.defaultPersonaId || 'partner',
      defaultRoleId: metadata.defaultRoleId || 'assistant',
      parameters: {
        useTools: metadata.parameters?.useTools ?? true,
        useReasoning: metadata.parameters?.useReasoning ?? true,
        ...metadata.parameters,
      },
    },
    messages,
  };
}

export const ChatView: React.FC<ChatViewProps> = ({
  content,
  path = '',
  baseName = '',
  isReadOnly = false,
  onChangeContent,
  showExportButton = false,
  onExportToFile,
  isExporting = false,
}) => {
  const { openDocuments, activeDocument, activeLeftItem, activeRightItem } = useDocument();

  const [input, setInput] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [useTools, setUseTools] = useState<boolean>(() => {
    try {
      const parsed = content ? JSON.parse(content) : null;
      return parsed?.metadata?.parameters?.useTools ?? true;
    } catch {
      return true;
    }
  });
  const [useReasoning, setUseReasoning] = useState<boolean>(() => {
    try {
      const parsed = content ? JSON.parse(content) : null;
      return parsed?.metadata?.parameters?.useReasoning ?? true;
    } catch {
      return true;
    }
  });
  const [includeContext, setIncludeContext] = useState<boolean>(true);

  const activeAssistantMsgIdRef = useRef<string | null>(null);

  const defaultTitle = baseName ? fileService.stem(baseName) : 'AI執筆相談';

  const [fileData, setFileData] = useState<ChFileStructure>(() => {
    if (!content || !content.trim()) {
      return createDefaultStructure(defaultTitle);
    }
    try {
      const parsed = JSON.parse(content);
      return normalizeChData(parsed, defaultTitle);
    } catch {
      return createDefaultStructure(defaultTitle);
    }
  });

  // 外部からの content 変更を検知して同期
  useEffect(() => {
    if (!content || !content.trim()) {
      return;
    }
    try {
      const parsed = JSON.parse(content);
      const normalized = normalizeChData(parsed, defaultTitle);
      setFileData(normalized);
      if (normalized.metadata?.parameters?.useTools !== undefined) {
        setUseTools(normalized.metadata.parameters.useTools);
      }
      if (normalized.metadata?.parameters?.useReasoning !== undefined) {
        setUseReasoning(normalized.metadata.parameters.useReasoning);
      }
    } catch (e) {
      console.warn('Failed to parse .ch content JSON:', e);
    }
  }, [content, defaultTitle]);

  // ファイルデータ保存
  const saveFile = useCallback(
    (newData: ChFileStructure) => {
      const currentMeta = newData?.metadata || {};
      const updated: ChFileStructure = {
        ...newData,
        version: newData?.version || '1.0',
        metadata: {
          ...currentMeta,
          updatedAt: formatTimestamp(),
        },
        messages: newData?.messages || [],
      };
      setFileData(updated);
      if (onChangeContent) {
        onChangeContent(JSON.stringify(updated, null, 2));
      }
    },
    [onChangeContent]
  );

  const currentPersonaId = fileData?.metadata?.defaultPersonaId || 'partner';
  const currentPersona =
    DEFAULT_STATIC_PERSONAS.find((p) => p.id === currentPersonaId) || DEFAULT_STATIC_PERSONAS[0];

  const { settings } = useSettings();
  const scopedModels: string[] = useMemo(() => {
    if (Array.isArray(settings.aiScopedModels) && settings.aiScopedModels.length > 0) {
      return settings.aiScopedModels;
    }
    return ['gemini:gemini-2.5-flash', 'gemini:gemini-2.5-pro', 'lm-studio:qwen2.5-7b-instruct'];
  }, [settings.aiScopedModels]);

  const defaultModelKey = settings.aiDefaultModel || scopedModels[0] || 'gemini:gemini-2.5-flash';
  const lmStudioUrl = settings.aiLmStudioUrl || 'http://localhost:1234/v1';
  const geminiApiKey = settings.aiGeminiApiKey || '';

  // ドキュメントに保存されているモデルまたは設定のデフォルト
  const currentModelKey = useMemo(() => {
    const params = fileData?.metadata?.parameters;
    if (params?.model) {
      if (params.provider) {
        return `${params.provider}:${params.model}`;
      }
      return params.model.includes(':') ? params.model : `gemini:${params.model}`;
    }
    return defaultModelKey;
  }, [fileData?.metadata?.parameters, defaultModelKey]);

  const handleModelChange = useCallback(
    (newKey: string) => {
      const parts = newKey.split(':');
      const provider = parts.length > 1 ? parts[0] : 'gemini';
      const model = parts.length > 1 ? parts[1] : parts[0];

      const next: ChFileStructure = {
        ...fileData,
        metadata: {
          ...(fileData?.metadata || {}),
          parameters: {
            ...(fileData?.metadata?.parameters || {}),
            provider,
            model,
          },
        },
      };
      saveFile(next);
    },
    [fileData, saveFile]
  );

  const handlePersonaChange = (id: string) => {
    const next: ChFileStructure = {
      ...fileData,
      metadata: {
        ...(fileData?.metadata || {}),
        defaultPersonaId: id,
      },
    };
    saveFile(next);
  };

  const handleTitleChange = (newTitle: string) => {
    const next: ChFileStructure = {
      ...fileData,
      metadata: {
        ...(fileData?.metadata || {}),
        title: newTitle,
      },
    };
    saveFile(next);
  };

  const handleMessagesChange = (newMessages: ChatMessage[]) => {
    const next: ChFileStructure = {
      ...fileData,
      messages: newMessages,
    };
    saveFile(next);
  };

  const handleUseReasoningChange = useCallback(
    (newVal: boolean) => {
      setUseReasoning(newVal);
      const next: ChFileStructure = {
        ...fileData,
        metadata: {
          ...(fileData?.metadata || {}),
          parameters: {
            ...(fileData?.metadata?.parameters || {}),
            useReasoning: newVal,
          },
        },
      };
      saveFile(next);
    },
    [fileData, saveFile]
  );

  const handleUseToolsChange = useCallback(
    (newVal: boolean) => {
      setUseTools(newVal);
      const next: ChFileStructure = {
        ...fileData,
        metadata: {
          ...(fileData?.metadata || {}),
          parameters: {
            ...(fileData?.metadata?.parameters || {}),
            useTools: newVal,
          },
        },
      };
      saveFile(next);
    },
    [fileData, saveFile]
  );

  // メッセージ送信
  const handleSend = async () => {
    if (!input.trim() || isStreaming || isReadOnly) return;

    const userText = input.trim();
    setInput('');

    // コンテキストの収集（編集中原稿など）
    let contextContent = '';
    if (includeContext) {
      const contextDocs = [];
      if (activeLeftItem && activeLeftItem.path !== path) {
        const doc = openDocuments.find((d) => d.path === activeLeftItem.path);
        if (doc) contextDocs.push(`【左ペイン (${doc.fileTitle})】\n${doc.content}`);
      }
      if (activeRightItem && activeRightItem.path !== path) {
        const doc = openDocuments.find((d) => d.path === activeRightItem.path);
        if (doc) contextDocs.push(`【右ペイン (${doc.fileTitle})】\n${doc.content}`);
      }
      if (contextDocs.length === 0 && activeDocument && activeDocument.path !== path) {
        contextDocs.push(`【アクティブ原稿 (${activeDocument.fileTitle})】\n${activeDocument.content}`);
      }
      contextContent = contextDocs.join('\n\n---\n\n');
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userText,
      parts: [{ type: 'text', content: userText }],
      timestamp: formatTimestamp(),
    };

    const assistantMsgId = `asst-${Date.now() + 1}`;
    activeAssistantMsgIdRef.current = assistantMsgId;

    const initialParts: ChatMessagePart[] = [];
    if (useReasoning) {
      initialParts.push({ type: 'thought', content: '' });
    }
    initialParts.push({ type: 'text', content: '' });

    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      persona: currentPersonaId,
      agentId: currentPersonaId,
      name: currentPersona.name,
      content: '',
      parts: initialParts,
      timestamp: formatTimestamp(),
    };

    const nextData: ChFileStructure = {
      ...fileData,
      messages: [...(fileData?.messages || []), userMsg, assistantMsg],
    };

    setFileData(nextData);
    saveFile(nextData);
    setIsStreaming(true);

    try {
      const uiDocumentContext: UIDocumentContext = {
        getOpenDocuments: () =>
          openDocuments.map((d) => ({
            path: d.path,
            title: d.fileTitle || d.baseName,
            isDirty: d.isDirty,
          })),
        getActiveDocument: () =>
          activeDocument
            ? {
                path: activeDocument.path,
                title: activeDocument.fileTitle || activeDocument.baseName,
                content: activeDocument.content,
                isDirty: activeDocument.isDirty,
              }
            : null,
      };

      // 選択中のプロバイダー・モデルの解決
      const parts = currentModelKey.split(':');
      const targetProvider = parts.length > 1 ? parts[0] : 'gemini';
      const targetModel = parts.length > 1 ? parts[1] : parts[0];

      // PiWritingAgentSession の実行
      const session = new PiWritingAgentSession({
        persona: currentPersonaId as any,
        model: targetModel,
        provider: targetProvider as any,
        baseUrl: targetProvider === 'lm-studio' ? lmStudioUrl : undefined,
        apiKey: targetProvider === 'gemini' ? geminiApiKey : undefined,
        useReasoning,
        contextContent,
        uiDocumentContext,
        onThoughtToken: (thoughtDelta) => {
          if (!useReasoning) return;

          setFileData((prev) => {
            const updatedMessages = prev.messages.map((m) => {
              if (m.id !== assistantMsgId) return m;

              const parts = [...(m.parts || [])];
              let thoughtPartIdx = parts.findIndex((p) => p.type === 'thought');

              if (thoughtPartIdx === -1) {
                // 先頭に thought パートを挿入
                parts.unshift({ type: 'thought', content: thoughtDelta });
              } else {
                parts[thoughtPartIdx] = {
                  ...parts[thoughtPartIdx],
                  content: parts[thoughtPartIdx].content + thoughtDelta,
                };
              }

              return {
                ...m,
                parts,
              };
            });

            return {
              ...prev,
              messages: updatedMessages,
            };
          });
        },
        onToken: (delta) => {
          setFileData((prev) => {
            const updatedMessages = prev.messages.map((m) => {
              if (m.id !== assistantMsgId) return m;

              const parts = [...(m.parts || [])];
              const textPartIdx = parts.findIndex((p) => p.type === 'text');

              if (textPartIdx !== -1) {
                parts[textPartIdx] = {
                  ...parts[textPartIdx],
                  content: parts[textPartIdx].content + delta,
                };
              } else {
                parts.push({ type: 'text', content: delta });
              }

              return {
                ...m,
                content: (m.content || '') + delta,
                parts,
              };
            });

            return {
              ...prev,
              messages: updatedMessages,
            };
          });
        },
        onEvent: (event) => {
          if (event.type === 'tool_call_start') {
            setFileData((prev) => {
              const updatedMessages = prev.messages.map((m) => {
                if (m.id !== assistantMsgId) return m;
                const parts = [...(m.parts || [])];
                parts.push({
                  type: 'tool_call',
                  content: `ツール実行: ${event.toolName}`,
                  metadata: {
                    tool_call: {
                      id: event.callId,
                      name: event.toolName,
                      arguments: event.args,
                    },
                  },
                });
                return { ...m, parts };
              });
              return { ...prev, messages: updatedMessages };
            });
          }
        },
      });

      await session.prompt(userText, contextContent);
    } catch (err: any) {
      console.error('[ChatView] 送信エラー:', err);
      setFileData((prev) => {
        const updatedMessages = prev.messages.map((m) => {
          if (m.id !== assistantMsgId) return m;
          return {
            ...m,
            content: (m.content || '') + `\n\nエラーが発生しました: ${err.message || '通信失敗'}`,
            parts: [
              ...(m.parts || []),
              { type: 'error' as const, content: err.message || '通信失敗' },
            ],
          };
        });
        return { ...prev, messages: updatedMessages };
      });
    } finally {
      setIsStreaming(false);
      // 完了した最新状態をファイルへ最終確定保存（空の thought パートは除去）
      setFileData((current) => {
        const cleanedMessages = current.messages.map((m) => {
          if (!m.parts) return m;
          const filteredParts = m.parts.filter(
            (p) => p.type !== 'thought' || (p.content && p.content.trim().length > 0)
          );
          return { ...m, parts: filteredParts };
        });
        const finalStruct = { ...current, messages: cleanedMessages };
        saveFile(finalStruct);
        return finalStruct;
      });
    }
  };

  return (
    <div className="chat-view-container">
      <ChatHeader
        title={fileData?.metadata?.title || fileService.stem(baseName) || 'チャット'}
        onTitleChange={!isReadOnly ? handleTitleChange : undefined}
        selectedPersonaId={currentPersonaId}
        onPersonaChange={!isReadOnly ? handlePersonaChange : () => {}}
        personas={DEFAULT_STATIC_PERSONAS}
        selectedModelKey={currentModelKey}
        onModelChange={!isReadOnly ? handleModelChange : undefined}
        scopedModels={scopedModels}
        onExportToFile={showExportButton ? onExportToFile : undefined}
        isExporting={isExporting}
      />

      <ChatMessageList
        messages={fileData?.messages || []}
        personas={DEFAULT_STATIC_PERSONAS}
        onMessagesChange={!isReadOnly ? handleMessagesChange : undefined}
      />

      {!isReadOnly && (
        <AIChatInput
          value={input}
          onChange={setInput}
          onSend={handleSend}
          isStreaming={isStreaming}
          useTools={useTools}
          onUseToolsChange={!isReadOnly ? handleUseToolsChange : undefined}
          useReasoning={useReasoning}
          onUseReasoningChange={!isReadOnly ? handleUseReasoningChange : undefined}
          includeContext={includeContext}
          onIncludeContextChange={setIncludeContext}
          contextHint={
            activeDocument && activeDocument.path !== path
              ? activeDocument.fileTitle
              : undefined
          }
        />
      )}
    </div>
  );
};
