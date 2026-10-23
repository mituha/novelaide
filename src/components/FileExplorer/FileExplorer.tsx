import { useState, useEffect, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  FilePlus,
  FolderPlus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { DirEntry } from "../../types/document";
import { fileService } from "../../services/fileService";
import { DocumentIcon } from "./DocumentIcon";
import "./FileExplorer.css";

interface FileExplorerProps {
  projectPath: string | null;
  onSelectFile?: (file: DirEntry) => void;
  selectedFilePath?: string | null;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  projectPath,
  onSelectFile,
  selectedFilePath,
}) => {
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState<"file" | "folder" | null>(null);
  const [newItemName, setNewItemName] = useState("");

  const loadDirectory = useCallback(async () => {
    if (!projectPath) {
      setEntries([]);
      return;
    }
    setIsLoading(true);
    try {
      const data = await fileService.readDirectory(projectPath, true);
      setEntries(data);
    } catch (err) {
      console.error("ディレクトリ読み込みエラー:", err);
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !projectPath) return;

    const separator = projectPath.includes("\\") ? "\\" : "/";
    const targetPath = `${projectPath}${separator}${newItemName.trim()}`;

    try {
      if (isCreating === "file") {
        await fileService.createFile(targetPath);
      } else if (isCreating === "folder") {
        await fileService.createDirectory(targetPath);
      }
      setIsCreating(null);
      setNewItemName("");
      await loadDirectory();
    } catch (err) {
      alert(`作成に失敗しました: ${err}`);
    }
  };

  const handleDelete = async (e: React.MouseEvent, entry: DirEntry) => {
    e.stopPropagation();
    if (confirm(`「${entry.name}」を削除してもよろしいですか？`)) {
      try {
        await fileService.remove(entry.path);
        await loadDirectory();
      } catch (err) {
        alert(`削除に失敗しました: ${err}`);
      }
    }
  };

  const renderTree = (items: DirEntry[], depth = 0) => {
    return items.map((item) => {
      const isExpanded = expandedFolders.has(item.path);
      const isSelected = selectedFilePath === item.path;

      if (item.isDirectory) {
        return (
          <div key={item.path} className="tree-node">
            <div
              className={`tree-row folder-row ${isSelected ? "selected" : ""}`}
              style={{ paddingLeft: `${depth * 14 + 8}px` }}
              onClick={() => toggleFolder(item.path)}
              title={item.path}
            >
              <span className="folder-arrow">
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              <DocumentIcon type="directory" isOpen={isExpanded} size={15} />
              <span className="entry-name folder-name">{item.name}</span>
              <button
                type="button"
                className="entry-action-btn delete-btn"
                onClick={(e) => handleDelete(e, item)}
                title="フォルダ削除"
              >
                <Trash2 size={13} />
              </button>
            </div>
            {isExpanded && item.children && (
              <div className="tree-children">
                {renderTree(item.children, depth + 1)}
              </div>
            )}
          </div>
        );
      }

      return (
        <div
          key={item.path}
          className={`tree-row file-row ${isSelected ? "selected" : ""}`}
          style={{ paddingLeft: `${depth * 14 + 22}px` }}
          onClick={() => onSelectFile?.(item)}
          title={item.path}
        >
          <DocumentIcon type={item.documentType} size={15} />
          <span className="entry-name file-name">{item.name}</span>
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

  if (!projectPath) {
    return (
      <div className="explorer-empty">
        <p>作品フォルダーが開かれていません</p>
      </div>
    );
  }

  return (
    <div className="file-explorer-root">
      <div className="explorer-toolbar">
        <span className="toolbar-title">原稿ファイル</span>
        <div className="toolbar-actions">
          <button
            type="button"
            className="tool-btn"
            onClick={() => setIsCreating("file")}
            title="新規原稿ファイル作成"
          >
            <FilePlus size={15} />
          </button>
          <button
            type="button"
            className="tool-btn"
            onClick={() => setIsCreating("folder")}
            title="新規フォルダー作成"
          >
            <FolderPlus size={15} />
          </button>
          <button
            type="button"
            className={`tool-btn ${isLoading ? "spinning" : ""}`}
            onClick={loadDirectory}
            title="ファイル一覧の再読み込み"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {isCreating && (
        <form className="inline-create-form" onSubmit={handleCreateSubmit}>
          <input
            type="text"
            className="inline-create-input"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder={isCreating === "file" ? "ファイル名 (例: 01_第1章.md)" : "フォルダ名 (例: characters)"}
            autoFocus
          />
          <div className="inline-create-actions">
            <button type="submit" className="inline-btn save">作成</button>
            <button
              type="button"
              className="inline-btn cancel"
              onClick={() => {
                setIsCreating(null);
                setNewItemName("");
              }}
            >
              取消
            </button>
          </div>
        </form>
      )}

      <div className="explorer-tree-container">
        {entries.length === 0 && !isLoading ? (
          <p className="no-files-text">ファイルがありません</p>
        ) : (
          renderTree(entries)
        )}
      </div>
    </div>
  );
};
