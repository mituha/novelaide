import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MoreHorizontal,
  Trash2,
  ArrowUpFromLine,
  ArrowDownFromLine,
  Bot,
  User,
  Wrench,
  Sparkles,
} from 'lucide-react';
import { ChatMessage, PersonaDefinition } from './ChatTypes';
import { MessageMarkdown } from './MessageMarkdown';
import './ChatMessageList.css';

interface ChatMessageListProps {
  messages: ChatMessage[];
  personas: PersonaDefinition[];
  onMessagesChange?: (newMessages: ChatMessage[]) => void;
  isStreaming?: boolean;
}

const displayTimestamp = (ts?: string | number): string => {
  if (!ts) return '';
  if (typeof ts === 'number') {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const h = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${y}/${m}/${day} ${h}:${min}`;
  }
  const str = String(ts);
  if (str.length === 14) {
    const y = str.substring(0, 4);
    const m = str.substring(4, 6);
    const d = str.substring(6, 8);
    const h = str.substring(8, 10);
    const min = str.substring(10, 12);
    return `${y}/${m}/${d} ${h}:${min}`;
  }
  return str;
};

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  messages,
  personas,
  onMessagesChange,
  isStreaming = false,
}) => {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isAutoScrollEnabledRef = useRef<boolean>(true);

  // ユーザーの手動スクロールを検知（上部にスクロール中は自動追従を一時停止、一番下に戻ったら再開）
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    isAutoScrollEnabledRef.current = isAtBottom;
  };

  const scrollToBottom = useCallback((smooth = false) => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  }, []);

  // 新規メッセージ追加時（ユーザー送信や新規アシスタント枠生成時）は強制スクロール
  useEffect(() => {
    isAutoScrollEnabledRef.current = true;
    scrollToBottom(true);
  }, [messages.length, scrollToBottom]);

  // ストリーミング中・トークン受信時の末尾更新監視
  const lastMessage = messages[messages.length - 1];
  const lastPartsText = (lastMessage?.parts || []).map((p) => p.content).join('');
  const lastContentWatch = `${lastMessage?.content || ''}:${lastPartsText}`;

  useEffect(() => {
    if (isAutoScrollEnabledRef.current) {
      scrollToBottom(false);
    }
  }, [lastContentWatch, isStreaming, scrollToBottom]);

  const handleDeleteMessage = (id: string) => {
    if (!onMessagesChange) return;
    onMessagesChange(messages.filter((m) => m.id !== id));
    setActiveMenuId(null);
  };

  const handleClearBefore = (id: string) => {
    if (!onMessagesChange) return;
    const index = messages.findIndex((m) => m.id === id);
    if (index !== -1) {
      onMessagesChange(messages.slice(index));
    }
    setActiveMenuId(null);
  };

  const handleClearAfter = (id: string) => {
    if (!onMessagesChange) return;
    const index = messages.findIndex((m) => m.id === id);
    if (index !== -1) {
      onMessagesChange(messages.slice(0, index + 1));
    }
    setActiveMenuId(null);
  };

  const handleClearAll = () => {
    if (!onMessagesChange) return;
    onMessagesChange([]);
    setActiveMenuId(null);
  };

  return (
    <div ref={containerRef} className="chat-message-list" onScroll={handleScroll}>
      {messages.map((msg) => {
        const isUser = msg.role === 'user';
        const isSystem = msg.role === 'system';
        const personaId = msg.persona || msg.agentId;
        const persona = personas.find((p) => p.id === personaId);

        if (isSystem) {
          return (
            <div key={msg.id} className="chat-system-separator">
              <span className="line" />
              <span className="system-text">{msg.content}</span>
              <span className="line" />
            </div>
          );
        }

        return (
          <div key={msg.id} className={`chat-message-row ${msg.role}`}>
            {!isUser && (
              <div className="chat-message-avatar" title={persona?.name || 'AI'}>
                <Bot size={20} className="avatar-icon bot" />
              </div>
            )}

            <div className="chat-message-content-col">
              <div className="chat-message-header">
                <span className="chat-message-sender-name">
                  {isUser ? 'あなた' : (msg.name || persona?.name || 'AIアシスタント')}
                </span>
                {msg.timestamp && (
                  <span className="chat-message-timestamp">
                    {displayTimestamp(msg.timestamp)}
                  </span>
                )}

                {onMessagesChange && (
                  <div className="chat-message-actions">
                    <button
                      type="button"
                      className="chat-action-btn"
                      onClick={() => setActiveMenuId(activeMenuId === msg.id ? null : msg.id)}
                      title="操作メニュー"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    {activeMenuId === msg.id && (
                      <div className="chat-action-menu">
                        <button type="button" onClick={() => handleDeleteMessage(msg.id)}>
                          <Trash2 size={13} />
                          <span>このメッセージを削除</span>
                        </button>
                        <button type="button" onClick={() => handleClearBefore(msg.id)}>
                          <ArrowUpFromLine size={13} />
                          <span>これより前をクリア</span>
                        </button>
                        <button type="button" onClick={() => handleClearAfter(msg.id)}>
                          <ArrowDownFromLine size={13} />
                          <span>これより後をクリア</span>
                        </button>
                        <button type="button" onClick={handleClearAll} className="menu-danger">
                          <Trash2 size={13} />
                          <span>履歴をすべてクリア</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="chat-message-bubble-group">
                <div className={`chat-message-bubble ${msg.role}`}>
                  {isUser ? (
                    <MessageMarkdown content={msg.content || ''} />
                  ) : (
                    <div className="chat-message-parts">
                      {msg.parts && msg.parts.length > 0 ? (
                        msg.parts.map((part, i) => (
                          <div key={`${msg.id}-part-${i}`} className={`chat-part part-${part.type}`}>
                            {part.type === 'thought' ? (
                              <details className="chat-thought">
                                <summary>
                                  <Sparkles size={13} />
                                  <span>思考プロセス</span>
                                </summary>
                                <div className="chat-thought-content">
                                  <MessageMarkdown content={part.content} />
                                </div>
                              </details>
                            ) : part.type === 'tool_call' ? (
                              <div className="chat-tool-badge">
                                <Wrench size={13} className="tool-icon" />
                                <span className="tool-name">
                                  {part.metadata?.tool_call?.name
                                    ? `${part.metadata.tool_call.name} を実行中...`
                                    : 'ツールを実行中...'}
                                </span>
                              </div>
                            ) : (
                              <MessageMarkdown content={part.content} />
                            )}
                          </div>
                        ))
                      ) : (
                        <MessageMarkdown content={msg.content || ''} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {isUser && (
              <div className="chat-message-avatar user" title="あなた">
                <User size={20} className="avatar-icon user" />
              </div>
            )}
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
};
