import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Bot,
  UserCheck,
  CheckCheck,
  Send,
  Trash2,
  FileText,
  BookmarkPlus,
  Search,
  Database,
} from 'lucide-react';
import { useAi } from '../../contexts/AiContext';
import { AiPersonaType } from 'tauri-plugin-novelaid-ai-api';
import './ChatPanel.css';

export const ChatPanel: React.FC = () => {
  const {
    models,
    selectedModel,
    setSelectedModel,
    personas,
    currentPersona,
    setCurrentPersona,
    messages,
    isLoading,
    includeActiveDocument,
    setIncludeActiveDocument,
    sendMessage,
    clearMessages,
    runProofread,
    runRubySuggest,
    searchProjectMetadata,
  } = useAi();

  const [input, setInput] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 新規メッセージ時に最下部へ自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const text = input;
    setInput('');
    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const getPersonaIcon = (id: AiPersonaType) => {
    switch (id) {
      case 'partner':
        return <Sparkles size={14} />;
      case 'editor':
        return <UserCheck size={14} />;
      case 'proofreader':
        return <CheckCheck size={14} />;
      case 'character':
        return <Bot size={14} />;
      default:
        return <Sparkles size={14} />;
    }
  };

  return (
    <div className="ai-chat-panel">
      {/* 上部ヘッダー：ペルソナ選択 */}
      <div className="ai-chat-header">
        <div className="ai-persona-selector">
          {personas.map((p) => {
            const isActive = currentPersona === p.id;
            return (
              <button
                key={p.id}
                className={`ai-persona-chip ${isActive ? 'active' : ''}`}
                onClick={() => setCurrentPersona(p.id)}
                title={`${p.role}: ${p.description}`}
              >
                {getPersonaIcon(p.id)}
                <span>{p.name}</span>
              </button>
            );
          })}
        </div>

        {/* サブバー：モデル選択 & 文脈トグル & クリア */}
        <div className="ai-meta-bar">
          <select
            className="ai-model-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={models.length === 0}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <div className="ai-header-actions">
            <label className="ai-toggle-doc" title="開いている原稿内容をAIの文脈に含めます">
              <input
                type="checkbox"
                checked={includeActiveDocument}
                onChange={(e) => setIncludeActiveDocument(e.target.checked)}
              />
              <FileText size={12} />
              <span>原稿文脈</span>
            </label>

            <button
              className="ai-action-btn"
              onClick={clearMessages}
              title="会話履歴をクリア"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* メッセージ履歴 */}
      <div className="ai-messages-container">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div key={msg.id} className={`ai-message ${isUser ? 'user' : 'assistant'}`}>
              <div className="ai-message-header">
                {!isUser && msg.persona && (
                  <>
                    {getPersonaIcon(msg.persona)}
                    <span>
                      {personas.find((p) => p.id === msg.persona)?.name || 'AI'}
                    </span>
                  </>
                )}
                {isUser && <span>あなた</span>}
                <span>{msg.timestamp}</span>
              </div>
              <div className="ai-message-bubble">{msg.content}</div>
            </div>
          );
        })}

        {isLoading && (
          <div className="ai-message assistant">
            <div className="ai-message-header">
              <Sparkles size={14} />
              <span>思考中...</span>
            </div>
            <div className="ai-message-bubble">AIが応答を生成しています...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* クイックツール実行バー（pi-coding-agent tools連携） */}
      <div className="ai-quick-tools">
        <button
          className="ai-tool-btn"
          onClick={() => runRubySuggest()}
          disabled={isLoading}
          title="現在の原稿からルビ候補を自動抽出します"
        >
          <BookmarkPlus size={13} />
          <span>ルビ抽出</span>
        </button>
        <button
          className="ai-tool-btn"
          onClick={() => runProofread()}
          disabled={isLoading}
          title="文末連続・表記ゆれ等の校正スキャンを実行します"
        >
          <Search size={13} />
          <span>校正スキャン</span>
        </button>
        <button
          className="ai-tool-btn"
          onClick={() => searchProjectMetadata()}
          disabled={isLoading}
          title="作品内のキャラクター設定や資料キャッシュを参照します"
        >
          <Database size={13} />
          <span>設定参照</span>
        </button>
      </div>

      {/* 入力エリア */}
      <div className="ai-input-container">
        <div className="ai-input-wrapper">
          <textarea
            className="ai-textarea"
            placeholder={`${
              personas.find((p) => p.id === currentPersona)?.name || 'AI'
            }に相談する...`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
          />
          <button
            className="ai-send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            title="送信 (Ctrl+Enter)"
          >
            <Send size={14} />
          </button>
        </div>
        <div className="ai-input-hint">
          <span>Ctrl + Enter で送信</span>
          <span>pi-coding-agent 協調モード</span>
        </div>
      </div>
    </div>
  );
};
