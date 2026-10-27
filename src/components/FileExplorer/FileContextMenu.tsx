import React, { useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  Edit2,
  Copy,
  Trash2,
  FolderPlus,
  FilePlus,
  FileCode,
} from 'lucide-react';
import { useFileExplorer } from '../../contexts/FileExplorerContext';
import './FileContextMenu.css';

export const FileContextMenu: React.FC = () => {
  const {
    contextMenu,
    closeContextMenu,
    startRename,
    deleteItem,
    revealInExplorer,
    copyPath,
    createNextFile,
    startCreateFolder,
  } = useFileExplorer();

  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!contextMenu) return;

    let x = contextMenu.x;
    let y = contextMenu.y;
    const menuWidth = 190;
    const menuHeight = 260;

    if (x + menuWidth > window.innerWidth) {
      x = Math.max(0, window.innerWidth - menuWidth - 8);
    }
    if (y + menuHeight > window.innerHeight) {
      y = Math.max(0, window.innerHeight - menuHeight - 8);
    }

    setCoords({ x, y });
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeContextMenu();
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu, closeContextMenu]);

  if (!contextMenu) return null;

  const { entry } = contextMenu;

  return (
    <div
      ref={menuRef}
      className="file-context-menu"
      style={{ left: `${coords.x}px`, top: `${coords.y}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="context-menu-header">
        <span className="context-menu-title">{entry.name}</span>
      </div>

      <button
        type="button"
        className="context-menu-item"
        onClick={() => {
          revealInExplorer(entry);
          closeContextMenu();
        }}
      >
        <ExternalLink size={14} />
        <span>エクスプローラーで表示</span>
      </button>

      {entry.isDirectory && (
        <>
          <div className="context-menu-separator" />
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              createNextFile();
              closeContextMenu();
            }}
          >
            <FilePlus size={14} />
            <span>新規原稿ファイル作成</span>
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              startCreateFolder();
              closeContextMenu();
            }}
          >
            <FolderPlus size={14} />
            <span>新規フォルダー作成</span>
          </button>
        </>
      )}

      <div className="context-menu-separator" />

      <button
        type="button"
        className="context-menu-item"
        onClick={() => {
          startRename(entry);
          closeContextMenu();
        }}
      >
        <Edit2 size={14} />
        <span>名前を変更</span>
        <span className="context-menu-shortcut">F2</span>
      </button>

      <button
        type="button"
        className="context-menu-item"
        onClick={() => {
          copyPath(entry, false);
          closeContextMenu();
        }}
      >
        <Copy size={14} />
        <span>パスをコピー</span>
      </button>

      <button
        type="button"
        className="context-menu-item"
        onClick={() => {
          copyPath(entry, true);
          closeContextMenu();
        }}
      >
        <FileCode size={14} />
        <span>相対パスをコピー</span>
      </button>

      <div className="context-menu-separator" />

      <button
        type="button"
        className="context-menu-item danger"
        onClick={() => {
          closeContextMenu();
          deleteItem(entry);
        }}
      >
        <Trash2 size={14} />
        <span>削除</span>
      </button>
    </div>
  );
};
