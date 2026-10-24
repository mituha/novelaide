import React, { useRef } from 'react';
import { Send, Wrench, Brain } from 'lucide-react';
import { useAutoResize } from '../hooks/useAutoResize';
import { AIContextSelector } from './AIContextSelector';
import { ContextDocumentItem } from '../hooks/useAIContextContent';

interface AIChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isStreaming?: boolean;
  placeholder?: string;
  showContextSelector?: boolean;
  useTools?: boolean;
  onUseToolsChange?: (use: boolean) => void;
  useReasoning?: boolean;
  onUseReasoningChange?: (use: boolean) => void;
  activeLeftItem?: ContextDocumentItem | null;
  activeRightItem?: ContextDocumentItem | null;
  openDocuments?: ContextDocumentItem[];
}

export const AIChatInput: React.FC<AIChatInputProps> = ({
  value,
  onChange,
  onSend,
  isStreaming = false,
  placeholder = 'メッセージを入力 (Enterで送信, Shift+Enterで改行)...',
  showContextSelector = true,
  useTools = true,
  onUseToolsChange,
  useReasoning = false,
  onUseReasoningChange,
  activeLeftItem,
  activeRightItem,
  openDocuments,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useAutoResize(textareaRef, value);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="ai-chat-input-container">
      <div className="ai-chat-input-wrapper">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isStreaming ? 'AI生成中...' : placeholder}
          disabled={isStreaming}
          rows={1}
          className="ai-chat-textarea"
        />

        <div className="ai-chat-features-toggles">
          {onUseToolsChange && (
            <button
              type="button"
              className={`ai-chat-feature-toggle ${useTools ? 'active' : ''}`}
              onClick={() => onUseToolsChange(!useTools)}
              title={useTools ? '執筆支援ツール: ON' : '執筆支援ツール: OFF'}
            >
              <Wrench size={14} />
            </button>
          )}
          {onUseReasoningChange && (
            <button
              type="button"
              className={`ai-chat-feature-toggle ${useReasoning ? 'active' : ''}`}
              onClick={() => onUseReasoningChange(!useReasoning)}
              title={useReasoning ? '推論思考プロセス: ON' : '推論思考プロセス: OFF'}
            >
              <Brain size={14} />
            </button>
          )}
        </div>

        <button
          type="button"
          className="ai-chat-send-btn"
          onClick={onSend}
          disabled={isStreaming || !value.trim()}
          title="送信 (Enter)"
        >
          <Send size={15} />
        </button>
      </div>

      {showContextSelector && (
        <div className="ai-chat-input-options">
          <AIContextSelector
            activeLeftItem={activeLeftItem}
            activeRightItem={activeRightItem}
            openDocuments={openDocuments}
          />
        </div>
      )}
    </div>
  );
};
