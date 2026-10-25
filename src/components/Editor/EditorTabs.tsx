import React from 'react';
import { useDocument, PaneId } from '../../contexts/DocumentContext';
import { DocumentIcon } from '../FileExplorer/DocumentIcon';
import { X, Columns2, BookOpen, Eye, Edit3 } from 'lucide-react';
import './EditorTabs.css';

interface EditorTabsProps {
  paneId?: PaneId;
}

export const EditorTabs: React.FC<EditorTabsProps> = ({ paneId = 'editor.left' }) => {
  const {
    getTabsForPane,
    getActiveDocumentForPane,
    activePathByPane,
    switchTab,
    closeTab,
    changeViewMode,
    openPreviewInOtherPane,
    splitToOtherPane,
    closePane,
  } = useDocument();

  const tabs = getTabsForPane(paneId);
  const activeDoc = getActiveDocumentForPane(paneId);
  const activePath = activePathByPane[paneId];

  if (tabs.length === 0) {
    return null;
  }

  // アクティブなドキュメントがプレビュー可能か（novel, markdown）
  const canPreview =
    activeDoc &&
    (activeDoc.documentType === 'novel' || activeDoc.documentType === 'markdown');

  // 現在のペインでのアクティブタブのビューモード
  const currentViewMode = tabs.find((t) => t.path === activePath)?.viewMode || 'editor';
  const isPreviewMode = currentViewMode === 'preview' || currentViewMode === 'reader';

  const handleToggleCurrentMode = () => {
    if (!activePath || !activeDoc) return;
    if (isPreviewMode) {
      changeViewMode(activePath, 'editor', paneId);
    } else {
      const targetMode = activeDoc.documentType === 'novel' ? 'reader' : 'preview';
      changeViewMode(activePath, targetMode, paneId);
    }
  };

  return (
    <div className={`editor-tabs-bar pane-bar-${paneId.replace('.', '-')}`}>
      <div className="editor-tabs-list">
        {tabs.map((tab) => {
          const isActive = tab.path === activePath;
          const isTabPreview = tab.viewMode === 'preview' || tab.viewMode === 'reader';

          return (
            <div
              key={`${paneId}-${tab.path}`}
              className={`editor-tab-item ${isActive ? 'active' : ''}`}
              onClick={() => switchTab(tab.path, paneId)}
              title={`${tab.path} (${tab.viewMode})`}
            >
              <DocumentIcon
                type={tab.documentType}
                isOpen={false}
                size={14}
              />
              <span className="tab-title">
                {isTabPreview ? `[Preview] ${tab.baseName}` : tab.baseName}
              </span>
              {tab.isDirty ? (
                <span className="dirty-indicator" title="未保存の変更あり（閉じるときに自動保存）">
                  ●
                </span>
              ) : null}
              <button
                type="button"
                className="tab-close-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.path, paneId);
                }}
                title="閉じる"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>

      {/* 右端のアクション群 */}
      <div className="editor-tabs-actions">
        {/* 1. 同一ペイン内での viewMode 切り替え (edit <-> preview) */}
        {canPreview && (
          <button
            type="button"
            className="editor-tab-action-btn"
            onClick={handleToggleCurrentMode}
            title={isPreviewMode ? '編集モードに切り替え' : 'プレビューモードに切り替え'}
          >
            {isPreviewMode ? <Edit3 size={13} /> : <Eye size={13} />}
            <span>{isPreviewMode ? '編集へ' : '表示'}</span>
          </button>
        )}

        {/* 2. 単にドキュメントを分割表示する機能（同じ状態のまま反対ペインに表示/アクティブ化） */}
        {activePath && (
          <button
            type="button"
            className="editor-tab-action-btn"
            onClick={() => splitToOtherPane(activePath, paneId)}
            title="反対側のペインに分割表示（同じ状態で開く/既存ならアクティブ化）"
          >
            <Columns2 size={13} />
            <span>横に分割</span>
          </button>
        )}

        {/* 3. 別サイドのビューにプレビュー状態で開く機能（既存ならアクティブ化） */}
        {activePath && canPreview && (
          <button
            type="button"
            className="editor-tab-action-btn"
            onClick={() => openPreviewInOtherPane(activePath, paneId)}
            title="反対側のペインにプレビューとして開く（既存ならアクティブ化）"
          >
            <BookOpen size={13} />
            <span>分割プレビュー</span>
          </button>
        )}

        {/* 4. 右ペイン時: ペインを閉じるボタン */}
        {paneId === 'editor.right' && (
          <button
            type="button"
            className="editor-tab-action-btn pane-close-action-btn"
            onClick={() => closePane('editor.right')}
            title="右ペインを閉じる"
          >
            <X size={13} />
            <span>ペインを閉じる</span>
          </button>
        )}
      </div>
    </div>
  );
};
