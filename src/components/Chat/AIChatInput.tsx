import React, { useRef, useEffect } from 'react';
import { Send, Square, Wrench, Sparkles, BookOpen, PenLine } from 'lucide-react';
import './AIChatInput.css';

interface AIChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isStreaming: boolean;
  placeholder?: string;
  useTools?: boolean;
  onUseToolsChange?: (val: boolean) => void;
  allowWrite?: boolean;
  onAllowWriteChange?: (val: boolean) => void;
  useReasoning?: boolean;
  onUseReasoningChange?: (val: boolean) => void;
  includeContext?: boolean;
  onIncludeContextChange?: (val: boolean) => void;
  contextHint?: string;
}

export const AIChatInput: React.FC<AIChatInputProps> = ({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
  placeholder = 'AIにメッセージを送信... (Shift+Enterで改行)',
  useTools = true,
  onUseToolsChange,
  allowWrite = false,
  onAllowWriteChange,
  useReasoning = false,
  onUseReasoningChange,
  includeContext = true,
  onIncludeContextChange,
  contextHint,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 入力内容に合わせて高さを自動伸縮
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 180)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 日本語IME変換中のEnter送信を防止
    if (e.nativeEvent.isComposing) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && value.trim()) {
        onSend();
      }
    }
  };

  return (
    <div className="chat-input-container">
      <div className="chat-input-toolbar">
        <div className="chat-toolbar-left">
          {onIncludeContextChange && (
            <button
              type="button"
              className={`chat-toggle-btn ${includeContext ? 'active' : ''}`}
              onClick={() => onIncludeContextChange(!includeContext)}
              title={contextHint ? `原稿コンテキスト: ${contextHint}` : '現在の原稿・設定をAIに参照させる'}
            >
              <BookOpen size={12} />
              <span>原稿参照</span>
            </button>
          )}

          {onUseToolsChange && (
            <button
              type="button"
              className={`chat-toggle-btn ${useTools ? 'active' : ''}`}
              onClick={() => onUseToolsChange(!useTools)}
              title="執筆支援ツールの利用 (ファイル参照・校正・ルビ等)"
            >
              <Wrench size={12} />
              <span>ツール</span>
            </button>
          )}

          {useTools && onAllowWriteChange && (
            <button
              type="button"
              className={`chat-toggle-btn ${allowWrite ? 'active warn' : ''}`}
              onClick={() => onAllowWriteChange(!allowWrite)}
              title={
                allowWrite
                  ? '直接編集: 許可（AIが原稿の差分修正やファイル更新を行えます）'
                  : '直接編集: 禁止（読み取り・校正・検索のみの安全モード）'
              }
            >
              <PenLine size={12} />
              <span>{allowWrite ? '直接編集: 許可' : '読み取り専用'}</span>
            </button>
          )}

          {onUseReasoningChange && (
            <button
              type="button"
              className={`chat-toggle-btn ${useReasoning ? 'active' : ''}`}
              onClick={() => onUseReasoningChange(!useReasoning)}
              title="推論・思考プロセスの展開"
            >
              <Sparkles size={12} />
              <span>思考プロセス</span>
            </button>
          )}
        </div>
      </div>

      <div className="chat-input-box">
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
        />

        <div className="chat-input-actions">
          {isStreaming ? (
            <button
              type="button"
              className="chat-send-btn stop"
              onClick={onStop}
              title="生成を中断"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              type="button"
              className="chat-send-btn send"
              onClick={onSend}
              disabled={!value.trim()}
              title="送信 (Enter)"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
