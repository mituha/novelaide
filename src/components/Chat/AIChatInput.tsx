import React, { useRef, useEffect } from 'react';
import { Send, Square, Wrench, Sparkles, PenLine, ShieldCheck } from 'lucide-react';
import { ContextTargetMode } from './ChatTypes';
import { AIContextSelector, DocSummary } from './AIContextSelector';
import './AIChatInput.css';

interface AIChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isStreaming: boolean;
  placeholder?: string;
  toolsPermission?: 'none' | 'read' | 'write';
  onToolsPermissionChange?: (permission: 'none' | 'read' | 'write') => void;
  useTools?: boolean;
  onUseToolsChange?: (val: boolean) => void;
  allowWrite?: boolean;
  onAllowWriteChange?: (val: boolean) => void;
  useReasoning?: boolean;
  onUseReasoningChange?: (val: boolean) => void;

  // コンテキスト選択関連
  contextMode?: ContextTargetMode;
  onContextModeChange?: (mode: ContextTargetMode) => void;
  includeFullText?: boolean;
  onIncludeFullTextChange?: (include: boolean) => void;
  leftDoc?: DocSummary | null;
  rightDoc?: DocSummary | null;
  activeDoc?: DocSummary | null;

  // 互換用
  includeContext?: boolean;
  onIncludeContextChange?: (val: boolean) => void;
}

export const AIChatInput: React.FC<AIChatInputProps> = ({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
  placeholder = 'AIにメッセージを送信... (Shift+Enterで改行)',
  toolsPermission,
  onToolsPermissionChange,
  useTools = true,
  onUseToolsChange,
  allowWrite = false,
  onAllowWriteChange,
  useReasoning = false,
  onUseReasoningChange,
  contextMode = 'active',
  onContextModeChange,
  includeFullText = true,
  onIncludeFullTextChange,
  leftDoc,
  rightDoc,
  activeDoc,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ツール権限レベルの解決（新プロパティ優先、フォールバックとして旧フラグ）
  const resolvedPermission: 'none' | 'read' | 'write' =
    toolsPermission !== undefined
      ? toolsPermission
      : !useTools
      ? 'none'
      : allowWrite
      ? 'write'
      : 'read';

  const handlePermissionSelect = (perm: 'none' | 'read' | 'write') => {
    if (onToolsPermissionChange) {
      onToolsPermissionChange(perm);
    } else {
      if (onUseToolsChange) onUseToolsChange(perm !== 'none');
      if (onAllowWriteChange) onAllowWriteChange(perm === 'write');
    }
  };

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
          {/* コンテキスト選択ドロップダウン */}
          {onContextModeChange && (
            <AIContextSelector
              mode={contextMode}
              onModeChange={onContextModeChange}
              includeFullText={includeFullText}
              onIncludeFullTextChange={onIncludeFullTextChange || (() => {})}
              leftDoc={leftDoc}
              rightDoc={rightDoc}
              activeDoc={activeDoc}
            />
          )}

          {/* ツール権限統合コンボボックス */}
          {(onToolsPermissionChange || onUseToolsChange) && (
            <div
              className={`chat-select-wrapper ${
                resolvedPermission !== 'none' ? 'active' : ''
              } ${resolvedPermission === 'write' ? 'warn' : ''}`}
            >
              {resolvedPermission === 'none' && <Wrench size={12} className="select-icon muted" />}
              {resolvedPermission === 'read' && <ShieldCheck size={12} className="select-icon read" />}
              {resolvedPermission === 'write' && <PenLine size={12} className="select-icon write" />}
              <select
                className="chat-permission-select"
                value={resolvedPermission}
                onChange={(e) => handlePermissionSelect(e.target.value as 'none' | 'read' | 'write')}
                title="AIのツール利用権限（安全モード / 直接編集許可 / 無効）"
              >
                <option value="none">ツール: OFF（対話のみ）</option>
                <option value="read">ツール: 読み取り専用（安全）</option>
                <option value="write">ツール: 直接編集を許可（書込）</option>
              </select>
            </div>
          )}

          {/* 思考プロセス・推論表示 */}
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
