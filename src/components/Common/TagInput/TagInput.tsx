import React, { useState, useRef, useCallback, KeyboardEvent, ClipboardEvent } from 'react';
import { X } from 'lucide-react';
import './TagInput.css';

export interface TagInputProps {
  tags: string[];
  onChange: (newTags: string[]) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export const TagInput: React.FC<TagInputProps> = ({
  tags,
  onChange,
  placeholder = 'タグを入力して Enter, Tab またはカンマ',
  id,
  disabled = false,
  className = '',
}) => {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);

  // タグ追加ロジック
  const addTag = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      // 重複防止（大文字小文字無視）
      if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
        setInputValue('');
        return;
      }
      onChange([...tags, trimmed]);
      setInputValue('');
    },
    [tags, onChange]
  );

  // タグ削除ロジック
  const removeTag = useCallback(
    (index: number) => {
      onChange(tags.filter((_, i) => i !== index));
    },
    [tags, onChange]
  );

  // キーボード操作ハンドラ
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // 日本語 IME 変換中の Enter は無視
    if (e.nativeEvent.isComposing || isComposingRef.current) {
      return;
    }

    if (e.key === 'Enter' || e.key === ',' || e.key === '、') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Tab' && inputValue.trim()) {
      // 入力がある場合のみ Tab でタグ確定
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      e.preventDefault();
      removeTag(tags.length - 1);
    }
  };

  // ペースト時のカンマ区切り分割対応
  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted.includes(',') || pasted.includes('、')) {
      e.preventDefault();
      const parts = pasted.split(/[,、]/).map((s) => s.trim()).filter(Boolean);
      const newTags = [...tags];
      for (const p of parts) {
        if (!newTags.some((t) => t.toLowerCase() === p.toLowerCase())) {
          newTags.push(p);
        }
      }
      onChange(newTags);
      setInputValue('');
    }
  };

  // コンテナクリック時に input へフォーカス
  const handleContainerClick = () => {
    inputRef.current?.focus();
  };

  return (
    <div
      className={`tag-input-container ${disabled ? 'disabled' : ''} ${className}`}
      onClick={handleContainerClick}
    >
      {tags.map((tag, idx) => (
        <span key={`${tag}-${idx}`} className="tag-chip">
          <span className="tag-chip-text">{tag}</span>
          {!disabled && (
            <button
              type="button"
              className="tag-chip-remove"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(idx);
              }}
              title={`タグ「${tag}」を削除`}
            >
              <X size={12} />
            </button>
          )}
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        type="text"
        className="tag-input-field"
        value={inputValue}
        disabled={disabled}
        placeholder={tags.length === 0 ? placeholder : ''}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
        }}
      />
    </div>
  );
};
