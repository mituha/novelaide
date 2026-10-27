import React from 'react';
import { ChevronRight, ChevronDown, Trash2 } from 'lucide-react';
import { DirEntry } from '../../types/document';
import { DocumentIcon } from './DocumentIcon';
import { FileContextMenu } from './FileContextMenu';
import { useFileExplorer } from '../../contexts/FileExplorerContext';
import './FileExplorer.css';

interface FileExplorerProps {
  projectPath: string | null;
  onSelectFile?: (file: DirEntry) => void;
  selectedFilePath?: string | null;
  showToolbar?: boolean;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  projectPath,
  showToolbar = false,
}) => {
  const {
    entries,
    expandedFolders,
    selectedPath,
    creatingDir,
    creatingType,
    newItemName,
    isLoading,
    toggleFolder,
    selectItem,
    setNewItemName,
    cancelCreate,
    submitCreate,
    deleteItem,
    openFile,
    renamingPath,
    renamingName,
    setRenamingName,
    startRename,
    cancelRename,
    submitRename,
    openContextMenu,
  } = useFileExplorer();

  if (!projectPath) {
    return (
      <div className="explorer-empty">
        <p>作品フォルダーが開かれていません</p>
      </div>
    );
  }

  // フォルダクリック時（開閉 ＋ 選択）
  const handleFolderClick = (e: React.MouseEvent, item: DirEntry) => {
    e.stopPropagation();
    toggleFolder(item.path);
    selectItem(item.path, true);
  };

  // ファイルクリック時（オープン ＋ 選択）
  const handleFileClick = (e: React.MouseEvent, item: DirEntry) => {
    e.stopPropagation();
    openFile(item);
  };

  // 余白クリック時（選択をルートにリセット）
  const handleBackgroundClick = () => {
    selectItem(null, false);
  };

  const handleDelete = (e: React.MouseEvent, entry: DirEntry) => {
    e.stopPropagation();
    deleteItem(entry);
  };

  // インライン新規作成入力行
  const renderInlineCreateInput = (depth: number) => {
    return (
      <div
        className="tree-row inline-create-row"
        style={{ paddingLeft: `${depth * 14 + (creatingType === 'folder' ? 8 : 22)}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        {creatingType === 'folder' ? (
          <>
            <span className="folder-arrow">
              <ChevronRight size={14} style={{ opacity: 0 }} />
            </span>
            <DocumentIcon type="directory" isOpen={false} size={15} />
          </>
        ) : (
          <DocumentIcon type="novel" size={15} />
        )}
        <input
          type="text"
          className="inline-create-input-row"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submitCreate();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelCreate();
            }
          }}
          onBlur={() => {
            if (!newItemName.trim()) {
              cancelCreate();
            }
          }}
          placeholder={creatingType === 'file' ? 'ファイル名 (Enterで作成)' : 'フォルダ名 (Enterで作成)'}
          autoFocus
        />
      </div>
    );
  };

  const renderTree = (items: DirEntry[], depth = 0) => {
    return items.map((item) => {
      const isExpanded = expandedFolders.has(item.path);
      const isSelected = selectedPath === item.path;
      const isRenaming = renamingPath === item.path;

      if (item.isDirectory) {
        const isCreatingInside = creatingDir === item.path && creatingType !== null;

        return (
          <div key={item.path} className="tree-node">
            <div
              className={`tree-row folder-row ${isSelected ? 'selected' : ''}`}
              style={{ paddingLeft: `${depth * 14 + 8}px` }}
              onClick={(e) => handleFolderClick(e, item)}
              onContextMenu={(e) => openContextMenu(e, item)}
              onKeyDown={(e) => {
                if (e.key === 'F2') {
                  e.preventDefault();
                  startRename(item);
                } else if (e.key === 'Delete') {
                  e.preventDefault();
                  deleteItem(item);
                }
              }}
              tabIndex={0}
              title={item.path}
            >
              <span className="folder-arrow">
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              <DocumentIcon type="directory" isOpen={isExpanded} size={15} />
              
              {isRenaming ? (
                <input
                  className="inline-rename-input"
                  value={renamingName}
                  onChange={(e) => setRenamingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitRename();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelRename();
                    }
                  }}
                  onBlur={() => submitRename()}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                  onFocus={(e) => e.target.select()}
                />
              ) : (
                <span className="entry-name folder-name">{item.name}</span>
              )}

              <button
                type="button"
                className="entry-action-btn delete-btn"
                onClick={(e) => handleDelete(e, item)}
                title="フォルダ削除"
              >
                <Trash2 size={13} />
              </button>
            </div>
            {isExpanded && (
              <div className="tree-children">
                {isCreatingInside && renderInlineCreateInput(depth + 1)}
                {item.children && renderTree(item.children, depth + 1)}
              </div>
            )}
          </div>
        );
      }

      return (
        <div
          key={item.path}
          className={`tree-row file-row ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${depth * 14 + 22}px` }}
          onClick={(e) => handleFileClick(e, item)}
          onContextMenu={(e) => openContextMenu(e, item)}
          onKeyDown={(e) => {
            if (e.key === 'F2') {
              e.preventDefault();
              startRename(item);
            } else if (e.key === 'Delete') {
              e.preventDefault();
              deleteItem(item);
            }
          }}
          tabIndex={0}
          title={item.path}
        >
          <DocumentIcon type={item.documentType} size={15} />
          
          {isRenaming ? (
            <input
              className="inline-rename-input"
              value={renamingName}
              onChange={(e) => setRenamingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitRename();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelRename();
                }
              }}
              onBlur={() => submitRename()}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              onFocus={(e) => {
                const val = e.target.value;
                const dotIdx = val.lastIndexOf('.');
                if (dotIdx > 0) {
                  e.target.setSelectionRange(0, dotIdx);
                } else {
                  e.target.select();
                }
              }}
            />
          ) : (
            <span className="entry-name file-name">{item.name}</span>
          )}

          <button
            type="button"
            className="entry-action-btn delete-btn"
            onClick={(e) => handleDelete(e, item)}
            title="ファイル削除"
          >
            <Trash2 size={13} />
          </button>
        </div>
      );
    });
  };

  const isCreatingInRoot = creatingDir === projectPath && creatingType !== null;

  return (
    <div className="file-explorer-root">
      {showToolbar && (
        <div className="explorer-toolbar">
          <span className="toolbar-title">原稿ファイル</span>
        </div>
      )}

      <div className="explorer-tree-container" onClick={handleBackgroundClick}>
        {isCreatingInRoot && renderInlineCreateInput(0)}
        {entries.length === 0 && !isLoading && !isCreatingInRoot ? (
          <p className="no-files-text">ファイルがありません</p>
        ) : (
          renderTree(entries)
        )}
      </div>

      <FileContextMenu />
    </div>
  );
};
