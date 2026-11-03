import React from 'react';
import { BookOpen, Check, ChevronDown } from 'lucide-react';
import { ContextTargetMode } from './ChatTypes';
import './AIContextSelector.css';

export interface DocSummary {
  title: string;
  length: number;
  path: string;
}

interface AIContextSelectorProps {
  mode: ContextTargetMode;
  onModeChange: (mode: ContextTargetMode) => void;
  includeFullText: boolean;
  onIncludeFullTextChange: (include: boolean) => void;
  leftDoc?: DocSummary | null;
  rightDoc?: DocSummary | null;
  activeDoc?: DocSummary | null;
}

export const AIContextSelector: React.FC<AIContextSelectorProps> = ({
  mode,
  onModeChange,
  includeFullText,
  onIncludeFullTextChange,
  leftDoc,
  rightDoc,
  activeDoc,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // 外部クリックでメニューを閉じる
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // 現在選択されているコンテキストの文字数と推定トークン数の集計
  const currentStats = React.useMemo(() => {
    let totalChars = 0;
    const titles: string[] = [];

    if (mode === 'active' && activeDoc) {
      totalChars += activeDoc.length;
      titles.push(activeDoc.title);
    } else if (mode === 'left' && leftDoc) {
      totalChars += leftDoc.length;
      titles.push(`左: ${leftDoc.title}`);
    } else if (mode === 'right' && rightDoc) {
      totalChars += rightDoc.length;
      titles.push(`右: ${rightDoc.title}`);
    } else if (mode === 'both') {
      if (leftDoc) {
        totalChars += leftDoc.length;
        titles.push(`左: ${leftDoc.title}`);
      }
      if (rightDoc) {
        totalChars += rightDoc.length;
        titles.push(`右: ${rightDoc.title}`);
      }
    }

    const estimatedTokens = Math.ceil(totalChars * 1.2);
    return {
      totalChars,
      estimatedTokens,
      summaryText: titles.join(', ') || '選択なし',
    };
  }, [mode, leftDoc, rightDoc, activeDoc]);

  const modeLabels: Record<ContextTargetMode, string> = {
    none: 'コンテキストなし',
    active: 'アクティブ原稿',
    left: '左ペイン原稿',
    right: '右ペイン原稿',
    both: '左右ペイン両方',
  };

  return (
    <div className="ai-context-selector-container" ref={containerRef}>
      <button
        type="button"
        className={`context-trigger-btn ${mode !== 'none' ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="AIへ渡す原稿コンテキストとプロンプト注入設定"
      >
        <BookOpen size={12} />
        <span className="trigger-label">{modeLabels[mode]}</span>
        {mode !== 'none' && currentStats.totalChars > 0 && (
          <span className="stats-badge" title={`${currentStats.totalChars.toLocaleString()} 文字`}>
            {includeFullText
              ? `${(currentStats.totalChars / 1000).toFixed(1)}k字 (~${currentStats.estimatedTokens} tk)`
              : '目次参照のみ'}
          </span>
        )}
        <ChevronDown size={11} className={`chevron-icon ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="context-dropdown-menu">
          <div className="dropdown-header">
            <span className="header-title">参照コンテキスト選択</span>
            <span className="header-tip">エディターの未保存テキストも反映されます</span>
          </div>

          <div className="mode-options-list">
            {/* なし */}
            <button
              type="button"
              className={`mode-option-btn ${mode === 'none' ? 'selected' : ''}`}
              onClick={() => {
                onModeChange('none');
                setIsOpen(false);
              }}
            >
              <div className="option-info">
                <span className="option-name">なし</span>
                <span className="option-desc">コンテキストを渡さず純粋に対話（トークン節約）</span>
              </div>
              {mode === 'none' && <Check size={14} className="check-icon" />}
            </button>

            {/* アクティブ原稿 */}
            <button
              type="button"
              className={`mode-option-btn ${mode === 'active' ? 'selected' : ''} ${!activeDoc ? 'disabled' : ''}`}
              disabled={!activeDoc}
              onClick={() => {
                onModeChange('active');
                setIsOpen(false);
              }}
            >
              <div className="option-info">
                <span className="option-name">
                  アクティブ原稿 {activeDoc && <span className="doc-name">({activeDoc.title})</span>}
                </span>
                <span className="option-desc">
                  {activeDoc
                    ? `${activeDoc.length.toLocaleString()} 文字 (~${Math.ceil(activeDoc.length * 1.2)} tokens)`
                    : '開かれている原稿がありません'}
                </span>
              </div>
              {mode === 'active' && <Check size={14} className="check-icon" />}
            </button>

            {/* 左ペイン */}
            <button
              type="button"
              className={`mode-option-btn ${mode === 'left' ? 'selected' : ''} ${!leftDoc ? 'disabled' : ''}`}
              disabled={!leftDoc}
              onClick={() => {
                onModeChange('left');
                setIsOpen(false);
              }}
            >
              <div className="option-info">
                <span className="option-name">
                  左ペイン {leftDoc && <span className="doc-name">({leftDoc.title})</span>}
                </span>
                <span className="option-desc">
                  {leftDoc
                    ? `${leftDoc.length.toLocaleString()} 文字`
                    : '左ペインにドキュメントが開かれていません'}
                </span>
              </div>
              {mode === 'left' && <Check size={14} className="check-icon" />}
            </button>

            {/* 右ペイン */}
            <button
              type="button"
              className={`mode-option-btn ${mode === 'right' ? 'selected' : ''} ${!rightDoc ? 'disabled' : ''}`}
              disabled={!rightDoc}
              onClick={() => {
                onModeChange('right');
                setIsOpen(false);
              }}
            >
              <div className="option-info">
                <span className="option-name">
                  右ペイン {rightDoc && <span className="doc-name">({rightDoc.title})</span>}
                </span>
                <span className="option-desc">
                  {rightDoc
                    ? `${rightDoc.length.toLocaleString()} 文字`
                    : '右ペインにドキュメントが開かれていません'}
                </span>
              </div>
              {mode === 'right' && <Check size={14} className="check-icon" />}
            </button>

            {/* 左右両方 */}
            <button
              type="button"
              className={`mode-option-btn ${mode === 'both' ? 'selected' : ''} ${!leftDoc && !rightDoc ? 'disabled' : ''}`}
              disabled={!leftDoc && !rightDoc}
              onClick={() => {
                onModeChange('both');
                setIsOpen(false);
              }}
            >
              <div className="option-info">
                <span className="option-name">左右ペイン両方</span>
                <span className="option-desc">設定資料（右）を見ながら原稿（左）を執筆する場合などに最適</span>
              </div>
              {mode === 'both' && <Check size={14} className="check-icon" />}
            </button>
          </div>

          {mode !== 'none' && (
            <div className="context-settings-footer">
              <label className="checkbox-label" title="OFFにすると、本文は直接送らずファイル名と概要のみを案内し、AIがツールで必要な部分だけを読み取ります">
                <input
                  type="checkbox"
                  checked={includeFullText}
                  onChange={(e) => onIncludeFullTextChange(e.target.checked)}
                />
                <span className="checkbox-text">プロンプトに本文を直接含める (プッシュ型)</span>
              </label>
              <div className="mode-hint">
                {includeFullText
                  ? '💡 即座に全コンテキストを把握できますが、トークンを消費します。'
                  : '💡 目次情報のみを渡し、詳細な本文はAIが read ツールで必要時に自律取得します（トークン節約）。'}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
