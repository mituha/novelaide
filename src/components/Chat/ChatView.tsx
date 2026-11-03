import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDocument } from '../../contexts/DocumentContext';
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

export const ChatView: React.FC<ChatViewProps> = ({
  content,
  path = '',
  baseName = '',
  onChangeContent,
  isReadOnly = false,
  onExportToFile,
  showExportButton = false,
  isExporting = false,
}) => {
  const { activeDocument, activeLeftItem, activeRightItem, openDocuments } = useDocument();

  const [input, setInput] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [useTools, setUseTools] = useState<boolean>(true);
  const [useReasoning, setUseReasoning] = useState<boolean>(true);
  const [includeContext, setIncludeContext] = useState<boolean>(true);

  const activeAssistantMsgIdRef = useRef<string | null>(null);

  // 初期の空ドキュメント用ファクトリ
  const createDefaultStructure = useCallback((): ChFileStructure => {
    return {
      version: '1.0',
      metadata: {
        title: baseName ? fileService.stem(baseName) : 'AI執筆相談',
        createdAt: formatTimestamp(),
        updatedAt: formatTimestamp(),
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
          timestamp: formatTimestamp(),
        },
      ],
    };
  }, [baseName]);

  const [fileData, setFileData] = useState<ChFileStructure>(() => {
    if (!content || !content.trim()) {
      return createDefaultStructure();
    }
    try {
      return JSON.parse(content);
    } catch {
      return createDefaultStructure();
    }
  });

  // 外部からの content 変更を検知して同期
  useEffect(() => {
    if (!content || !content.trim()) {
      return;
    }
    try {
      const parsed = JSON.parse(content);
      setFileData(parsed);
    } catch (e) {
      console.warn('Failed to parse .ch content JSON:', e);
    }
  }, [content]);

  // ファイルデータ保存
  const saveFile = useCallback(
    (newData: ChFileStructure) => {
      const updated: ChFileStructure = {
        ...newData,
        metadata: {
          ...newData.metadata,
          updatedAt: formatTimestamp(),
        },
      };
      setFileData(updated);
      if (onChangeContent) {
        onChangeContent(JSON.stringify(updated, null, 2));
      }
    },
    [onChangeContent]
  );

  const currentPersonaId = fileData.metadata.defaultPersonaId || 'partner';
  const currentPersona =
    DEFAULT_STATIC_PERSONAS.find((p) => p.id === currentPersonaId) || DEFAULT_STATIC_PERSONAS[0];

  const handlePersonaChange = (id: string) => {
    const next: ChFileStructure = {
      ...fileData,
      metadata: {
        ...fileData.metadata,
        defaultPersonaId: id,
      },
    };
    saveFile(next);
  };

  const handleTitleChange = (newTitle: string) => {
    const next: ChFileStructure = {
      ...fileData,
      metadata: {
        ...fileData.metadata,
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
      messages: [...fileData.messages, userMsg, assistantMsg],
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

      // PiWritingAgentSession の実行
      const session = new PiWritingAgentSession({
        persona: currentPersonaId as any,
        contextContent,
        uiDocumentContext,
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
      // 完了した最新状態をファイルへ最終確定保存
      setFileData((current) => {
        saveFile(current);
        return current;
      });
    }
  };

  return (
    <div className="chat-view-container">
      <ChatHeader
        title={fileData.metadata.title || fileService.stem(baseName) || 'チャット'}
        onTitleChange={!isReadOnly ? handleTitleChange : undefined}
        selectedPersonaId={currentPersonaId}
        onPersonaChange={!isReadOnly ? handlePersonaChange : () => {}}
        personas={DEFAULT_STATIC_PERSONAS}
        onExportToFile={showExportButton ? onExportToFile : undefined}
        isExporting={isExporting}
      />

      <ChatMessageList
        messages={fileData.messages}
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
          onUseToolsChange={setUseTools}
          useReasoning={useReasoning}
          onUseReasoningChange={setUseReasoning}
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
