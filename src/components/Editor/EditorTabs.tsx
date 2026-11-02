import React, { useRef, useState, useEffect } from 'react';
import { useDocument, PaneId, TabItem } from '../../contexts/DocumentContext';
import { DocumentIcon } from '../FileExplorer/DocumentIcon';
import {
  X,
  Columns2,
  BookOpen,
  Eye,
  Edit3,
  ChevronDown,
  Split,
  PanelRightClose,
} from 'lucide-react';
import './EditorTabs.css';

interface EditorTabsProps {
  paneId?: PaneId;
}

interface TabContextMenuState {
  x: number;
  y: number;
  tab: TabItem;
}

export const EditorTabs: React.FC<EditorTabsProps> = ({ paneId = 'editor.left' }) => {
  const {
    getTabsForPane,
    getActiveDocumentForPane,
    activePathByPane,
    switchTab,
    closeTab,
    closeOtherTabs,
    closeRightTabs,
    closeAllTabs,
    changeViewMode,
    openPreviewInOtherPane,
    splitToOtherPane,
    closePane,
    isSplit,
  } = useDocument();

  const tabs = getTabsForPane(paneId);
  const activeDoc = getActiveDocumentForPane(paneId);
  const activePath = activePathByPane[paneId];

  const tabsListRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<TabContextMenuState | null>(null);

  // ドロップダウンメニューの外側クリック検知
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  // コンテキストメニューの外側クリックおよびEscapeキー検知
  useEffect(() => {
    if (!contextMenu) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  // アクティブタブ変更時に可視領域へ自動スクロール
  useEffect(() => {
    if (!activePath || !tabsListRef.current) return;
    const activeElem = tabsListRef.current.querySelector<HTMLElement>('.editor-tab-item.active');
    if (activeElem) {
      activeElem.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [activePath]);

  // マウスホイールによる水平スクロール
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (tabsListRef.current) {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta !== 0) {
        tabsListRef.current.scrollLeft += delta;
      }
    }
  };

  // タブの右クリックハンドラ
  const handleTabContextMenu = (e: React.MouseEvent, tab: TabItem) => {
    e.preventDefault();
    e.stopPropagation();

    let x = e.clientX;
    let y = e.clientY;
    const menuWidth = 200;
    const menuHeight = 240;

    if (x + menuWidth > window.innerWidth) {
      x = Math.max(0, window.innerWidth - menuWidth - 8);
    }
    if (y + menuHeight > window.innerHeight) {
      y = Math.max(0, window.innerHeight - menuHeight - 8);
    }

    setContextMenu({ x, y, tab });
  };

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
    <div className={`editor-tabs-bar pane-bar-${paneId.replace('.', '-')} ${isSplit ? 'is-split' : ''}`}>
      {/* 開いているタブ一覧ドロップダウンボタン */}
      <div className="editor-tabs-dropdown-container" ref={dropdownRef}>
        <button
          type="button"
          className={`editor-tabs-dropdown-btn ${isDropdownOpen ? 'active' : ''}`}
          onClick={() => setIsDropdownOpen((prev) => !prev)}
          title="開いているタブ一覧"
          aria-label="開いているタブ一覧"
        >
          <ChevronDown size={14} />
        </button>

        {isDropdownOpen && (
          <div className="editor-tabs-dropdown-menu">
            <div className="editor-tabs-dropdown-header">
              <span>開いているタブ ({tabs.length})</span>
            </div>
            <div className="editor-tabs-dropdown-list">
              {tabs.map((tab) => {
                const isActive = tab.path === activePath;
                return (
                  <div
                    key={`dropdown-${tab.path}`}
                    className={`editor-tabs-dropdown-item ${isActive ? 'active' : ''} ${tab.isDirty ? 'is-dirty' : ''}`}
                    onClick={() => {
                      switchTab(tab.path, paneId);
                      setIsDropdownOpen(false);
                    }}
                    title={tab.path}
                  >
                    <DocumentIcon type={tab.documentType} isOpen={false} size={14} />
                    <span className="dropdown-item-title">{tab.baseName}</span>
                    {tab.isDirty && <span className="dropdown-dirty-indicator">●</span>}
                    <button
                      type="button"
                      className="dropdown-close-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.path, paneId);
                        if (tabs.length <= 1) {
                          setIsDropdownOpen(false);
                        }
                      }}
                      title="閉じる"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* スクロール可能なタブ一覧 */}
      <div className="editor-tabs-list" ref={tabsListRef} onWheel={handleWheel}>
        {tabs.map((tab) => {
          const isActive = tab.path === activePath;
          const isTabPreview = tab.viewMode === 'preview' || tab.viewMode === 'reader';

          return (
            <div
              key={`${paneId}-${tab.path}`}
              className={`editor-tab-item ${isActive ? 'active' : ''} ${tab.isDirty ? 'is-dirty' : ''}`}
              onClick={() => switchTab(tab.path, paneId)}
              onContextMenu={(e) => handleTabContextMenu(e, tab)}
              title={`${tab.path} (${tab.viewMode})${tab.isDirty ? ' - 未保存の変更あり' : ''}`}
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
            {!isSplit && <span>{isPreviewMode ? '編集へ' : '表示'}</span>}
          </button>
        )}

        {/* 2. 左ペイン時のみ: 単にドキュメントを分割表示する機能 */}
        {paneId === 'editor.left' && activePath && (
          <button
            type="button"
            className="editor-tab-action-btn"
            onClick={() => splitToOtherPane(activePath, paneId)}
            title="反対側のペインに分割表示（同じ状態で開く/既存ならアクティブ化）"
          >
            <Columns2 size={13} />
            {!isSplit && <span>横に分割</span>}
          </button>
        )}

        {/* 3. 左ペイン時のみ: 別サイドのビューにプレビュー状態で開く機能 */}
        {paneId === 'editor.left' && activePath && canPreview && (
          <button
            type="button"
            className="editor-tab-action-btn"
            onClick={() => openPreviewInOtherPane(activePath, paneId)}
            title="反対側のペインにプレビューとして開く（既存ならアクティブ化）"
          >
            <BookOpen size={13} />
            {!isSplit && <span>分割プレビュー</span>}
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
            {!isSplit && <span>ペインを閉じる</span>}
          </button>
        )}
      </div>

      {/* タブ右クリックコンテキストメニュー */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="tab-context-menu"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
        >
          <div
            className="tab-context-menu-item"
            onClick={() => {
              closeTab(contextMenu.tab.path, paneId);
              setContextMenu(null);
            }}
          >
            <X size={13} />
            <span>閉じる</span>
          </div>
          <div
            className="tab-context-menu-item"
            onClick={() => {
              closeOtherTabs(contextMenu.tab.path, paneId);
              setContextMenu(null);
            }}
          >
            <span>他のタブを閉じる</span>
          </div>
          <div
            className="tab-context-menu-item"
            onClick={() => {
              closeRightTabs(contextMenu.tab.path, paneId);
              setContextMenu(null);
            }}
          >
            <span>右側のタブを閉じる</span>
          </div>
          <div
            className="tab-context-menu-item"
            onClick={() => {
              closeAllTabs(paneId);
              setContextMenu(null);
            }}
          >
            <span>すべてのタブを閉じる</span>
          </div>

          <div className="tab-context-menu-separator" />

          <div
            className="tab-context-menu-item"
            onClick={() => {
              splitToOtherPane(contextMenu.tab.path, paneId);
              setContextMenu(null);
            }}
          >
            <Split size={13} />
            <span>横に分割して開く</span>
          </div>

          {(contextMenu.tab.documentType === 'novel' ||
            contextMenu.tab.documentType === 'markdown') && (
            <div
              className="tab-context-menu-item"
              onClick={() => {
                openPreviewInOtherPane(contextMenu.tab.path, paneId);
                setContextMenu(null);
              }}
            >
              <BookOpen size={13} />
              <span>分割プレビューで開く</span>
            </div>
          )}

          {isSplit && paneId === 'editor.right' && (
            <>
              <div className="tab-context-menu-separator" />
              <div
                className="tab-context-menu-item danger"
                onClick={() => {
                  closePane('editor.right');
                  setContextMenu(null);
                }}
              >
                <PanelRightClose size={13} />
                <span>右ペインを閉じる</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
