import React from 'react';
import { useDocument } from '../../contexts/DocumentContext';
import { DocumentIcon } from '../FileExplorer/DocumentIcon';
import { X, Columns2, BookOpen } from 'lucide-react';
import './EditorTabs.css';

export const EditorTabs: React.FC = () => {
  const {
    openDocuments,
    activePath,
    activeDocument,
    isSplitActive,
    setActivePath,
    closeDocument,
    toggleSplitPreview,
  } = useDocument();

  if (openDocuments.length === 0) {
    return null;
  }

  // アクティブなドキュメントがプレビュー可能か（novel, markdown）
  const canPreview =
    activeDocument &&
    (activeDocument.documentType === 'novel' ||
      activeDocument.documentType === 'markdown');

  return (
    <div className="editor-tabs-bar">
      <div className="editor-tabs-list">
        {openDocuments.map((doc) => {
          const isActive = doc.path === activePath;
          return (
            <div
              key={doc.path}
              className={`editor-tab-item ${isActive ? 'active' : ''}`}
              onClick={() => setActivePath(doc.path)}
              title={doc.path}
            >
              <DocumentIcon
                type={doc.documentType}
                isOpen={false}
                size={14}
              />
              <span className="tab-title">{doc.baseName}</span>
              {doc.isDirty ? (
                <span className="dirty-indicator" title="未保存の変更あり">
                  ●
                </span>
              ) : null}
              <button
                className="tab-close-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  closeDocument(doc.path);
                }}
                title="閉じる"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>

      {/* 右端のアクション群（スプリットプレビュートグル） */}
      {canPreview && (
        <div className="editor-tabs-actions">
          <button
            type="button"
            className={`editor-tab-action-btn ${isSplitActive ? 'active' : ''}`}
            onClick={() => toggleSplitPreview()}
            title={
              isSplitActive
                ? 'プレビュー分割表示を閉じる'
                : 'プレビューを左右分割で表示'
            }
          >
            {isSplitActive ? <BookOpen size={13} /> : <Columns2 size={13} />}
            <span>{isSplitActive ? 'プレビュー表示中' : 'プレビュー'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
