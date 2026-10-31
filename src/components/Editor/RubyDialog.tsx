import React, { useState, useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { getRubyCandidates } from 'tauri-plugin-novelaid-calibration-api';
import './RubyDialog.css';

interface RubyDialogProps {
  isOpen: boolean;
  initialText: string;
  onConfirm: (ruby: string) => void;
  onCancel: () => void;
}

export const RubyDialog: React.FC<RubyDialogProps> = ({
  isOpen,
  initialText,
  onConfirm,
  onCancel,
}) => {
  const [ruby, setRuby] = useState('');
  const [suggestedRuby, setSuggestedRuby] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    setRuby('');
    setSuggestedRuby(null);

    // 形態素解析による読み自動推測（漢字を含む場合）
    const fetchRubyCandidate = async () => {
      try {
        if (/[\u4E00-\u9FFF]/.test(initialText)) {
          const candidates = await getRubyCandidates(initialText);
          if (candidates && candidates.length > 0) {
            // 最も適した候補（完全一致または先頭候補）
            const matched = candidates.find((c) => c.surface === initialText) || candidates[0];
            if (matched && matched.ruby) {
              setRuby(matched.ruby);
              setSuggestedRuby(matched.ruby);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to auto-suggest ruby via Lindera:', err);
      }
    };

    fetchRubyCandidate();

    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [isOpen, initialText]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (ruby.trim()) {
        onConfirm(ruby.trim());
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      className="ruby-dialog-overlay"
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
      role="presentation"
    >
      <div
        className="ruby-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ruby-dialog-title"
      >
        <h3 id="ruby-dialog-title">ルビを振る</h3>
        <div className="ruby-dialog-target">
          対象: <strong>{initialText}</strong>
        </div>
        <div className="ruby-dialog-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            value={ruby}
            onChange={(e) => setRuby(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="ふりがな・読みを入力..."
            className="ruby-dialog-input"
          />
          {suggestedRuby && (
            <div className="ruby-dialog-hint">
              <Sparkles size={12} />
              <span>Lindera 形態素解析による自動推測</span>
            </div>
          )}
        </div>
        <div className="ruby-dialog-actions">
          <button type="button" onClick={onCancel} className="ruby-btn-cancel">
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => {
              if (ruby.trim()) {
                onConfirm(ruby.trim());
              }
            }}
            className="ruby-btn-confirm"
            disabled={!ruby.trim()}
          >
            確定 (Enter)
          </button>
        </div>
      </div>
    </div>
  );
};
