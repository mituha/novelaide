import React, { useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { useTheme } from '../../contexts/ThemeContext';
import { Columns2, AlignJustify } from 'lucide-react';
import './DiffEditorView.css';

export interface DiffEditorViewProps {
  filePath?: string;
  originalContent?: string;
  modifiedContent?: string;
  language?: string;
}

export const DiffEditorView: React.FC<DiffEditorViewProps> = ({
  filePath = '',
  originalContent = '',
  modifiedContent = '',
  language = 'markdown',
}) => {
  const { effectiveTheme } = useTheme();
  const [renderSideBySide, setRenderSideBySide] = useState(true);

  const getMonacoTheme = () => {
    if (effectiveTheme === 'sepia') return 'novel-sepia';
    if (effectiveTheme === 'light') return 'novel-light';
    return 'novel-dark';
  };

  return (
    <div className="diff-editor-view-container">
      {/* ツールバー */}
      <div className="diff-editor-toolbar">
        <div className="diff-file-title">
          <span>差分比較: {filePath}</span>
        </div>
        <div className="diff-toolbar-actions">
          <button
            type="button"
            className={`diff-toolbar-btn ${renderSideBySide ? 'active' : ''}`}
            onClick={() => setRenderSideBySide(true)}
            title="左右分割表示 (Side by Side)"
          >
            <Columns2 size={14} />
            <span>左右比較</span>
          </button>
          <button
            type="button"
            className={`diff-toolbar-btn ${!renderSideBySide ? 'active' : ''}`}
            onClick={() => setRenderSideBySide(false)}
            title="インライン表示 (Inline)"
          >
            <AlignJustify size={14} />
            <span>インライン</span>
          </button>
        </div>
      </div>

      {/* Monaco DiffEditor */}
      <div className="diff-editor-main">
        <DiffEditor
          height="100%"
          language={language}
          original={originalContent}
          modified={modifiedContent}
          theme={getMonacoTheme()}
          options={{
            readOnly: true,
            renderSideBySide,
            fontSize: 15,
            lineHeight: 26,
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            automaticLayout: true,
            diffWordWrap: 'on',
          }}
        />
      </div>
    </div>
  );
};
