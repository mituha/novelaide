import { useState, useEffect, useCallback, useMemo } from "react";
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

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

function getParentDir(p: string): string {
  const norm = normalizePath(p);
  const lastSlash = norm.lastIndexOf("/");
  if (lastSlash === -1) return p;
  return p.substring(0, lastSlash);
}

function joinPath(dir: string, name: string): string {
  const isBackslash = dir.includes("\\");
  const sep = isBackslash ? "\\" : "/";
  return dir.endsWith(sep) ? `${dir}${name}` : `${dir}${sep}${name}`;
}

function isSubPathOrEqual(sub: string, parent: string): boolean {
  const nSub = normalizePath(sub).toLowerCase();
  const nParent = normalizePath(parent).toLowerCase();
  return nSub === nParent || nSub.startsWith(nParent.endsWith("/") ? nParent : `${nParent}/`);
}

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

  // 選択中アイテムの状態
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedIsDir, setSelectedIsDir] = useState<boolean>(false);

  // 新規作成の状態（ターゲットフォルダ、作成種別、入力中の名前）
  const [creatingDir, setCreatingDir] = useState<string | null>(null);
  const [creatingType, setCreatingType] = useState<"file" | "folder" | null>(null);
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

  // 親から selectedFilePath が与えられたときの同期
  useEffect(() => {
    if (selectedFilePath) {
      setSelectedPath(selectedFilePath);
      setSelectedIsDir(false);
    }
  }, [selectedFilePath]);

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

  // フォルダクリック時（開閉 ＋ 選択）
  const handleFolderClick = (e: React.MouseEvent, item: DirEntry) => {
    e.stopPropagation();
    toggleFolder(item.path);
    setSelectedPath(item.path);
    setSelectedIsDir(true);
  };

  // ファイルクリック時（オープン ＋ 選択）
  const handleFileClick = (e: React.MouseEvent, item: DirEntry) => {
    e.stopPropagation();
    setSelectedPath(item.path);
    setSelectedIsDir(false);
    onSelectFile?.(item);
  };

  // 余白クリック時（選択をルートにリセット）
  const handleBackgroundClick = () => {
    setSelectedPath(null);
    setSelectedIsDir(false);
  };

  // ターゲットディレクトリの解決
  const resolveTargetDir = useCallback(() => {
    if (!projectPath) return null;
    if (selectedPath) {
      if (selectedIsDir) {
        return selectedPath;
      }
      const parent = getParentDir(selectedPath);
      if (parent && isSubPathOrEqual(parent, projectPath)) {
        return parent;
      }
    }
    return projectPath;
  }, [projectPath, selectedPath, selectedIsDir]);

  // 新規ファイルの即時作成（推測エンジンによりファイル名を自動決定して即座に開く）
  const handleCreateNextFile = async () => {
    const targetDir = resolveTargetDir();
    if (!targetDir) return;

    try {
      // バックエンド側で既存ファイル群から次のファイル名を推測し、一括作成
      const newEntry = await fileService.createNextFile(targetDir);

      if (targetDir !== projectPath) {
        setExpandedFolders((prev) => new Set(prev).add(targetDir));
      }

      await loadDirectory();

      // 作成されたファイルを選択状態にし、エディターで即座に開く
      setSelectedPath(newEntry.path);
      setSelectedIsDir(false);
      onSelectFile?.(newEntry);
    } catch (err) {
      alert(`新規ファイルの作成に失敗しました: ${err}`);
    }
  };

  // 新規フォルダー作成の開始（インライン入力）
  const handleStartCreateFolder = () => {
    const targetDir = resolveTargetDir();
    if (!targetDir) return;

    if (targetDir !== projectPath) {
      setExpandedFolders((prev) => new Set(prev).add(targetDir));
    }

    setCreatingDir(targetDir);
    setCreatingType("folder");
    setNewItemName("");
  };

  // 作成実行
  const handleCreateSubmit = async () => {
    if (!newItemName.trim() || !creatingDir) return;

    const targetPath = joinPath(creatingDir, newItemName.trim());
    const type = creatingType;

    try {
      if (type === "folder") {
        await fileService.createDirectory(targetPath);
      } else {
        await fileService.createFile(targetPath);
      }

      setCreatingDir(null);
      setCreatingType(null);
      setNewItemName("");
      await loadDirectory();

      setSelectedPath(targetPath);
      setSelectedIsDir(type === "folder");

      if (type === "folder") {
        setExpandedFolders((prev) => new Set(prev).add(targetPath));
      }
    } catch (err) {
      alert(`作成に失敗しました: ${err}`);
    }
  };

  const handleCancelCreate = () => {
    setCreatingDir(null);
    setCreatingType(null);
    setNewItemName("");
  };

  const handleDelete = async (e: React.MouseEvent, entry: DirEntry) => {
    e.stopPropagation();
    if (confirm(`「${entry.name}」を削除してもよろしいですか？`)) {
      try {
        await fileService.remove(entry.path);
        if (selectedPath === entry.path) {
          setSelectedPath(null);
          setSelectedIsDir(false);
        }
        await loadDirectory();
      } catch (err) {
        alert(`削除に失敗しました: ${err}`);
      }
    }
  };

  // ツールバーのヒントテキスト（作成先）
  const createTargetDescription = useMemo(() => {
    if (!projectPath) return "";
    if (selectedPath) {
      if (selectedIsDir) {
        const folderName = selectedPath.split(/[/\\]/).pop() || selectedPath;
        return `選択フォルダー「${folderName}」内`;
      }
      const parent = getParentDir(selectedPath);
      const parentName = parent.split(/[/\\]/).pop() || "ルート";
      return `「${parentName}」階層内`;
    }
    return "プロジェクトルート直下";
  }, [projectPath, selectedPath, selectedIsDir]);

  // インライン新規作成入力行
  const renderInlineCreateInput = (depth: number) => {
    return (
      <div
        className="tree-row inline-create-row"
        style={{ paddingLeft: `${depth * 14 + (creatingType === "folder" ? 8 : 22)}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        {creatingType === "folder" ? (
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
            if (e.key === "Enter") {
              e.preventDefault();
              handleCreateSubmit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              handleCancelCreate();
            }
          }}
          onBlur={() => {
            if (!newItemName.trim()) {
              handleCancelCreate();
            }
          }}
          placeholder={creatingType === "file" ? "ファイル名 (Enterで作成)" : "フォルダ名 (Enterで作成)"}
          autoFocus
        />
      </div>
    );
  };

  const renderTree = (items: DirEntry[], depth = 0) => {
    return items.map((item) => {
      const isExpanded = expandedFolders.has(item.path);
      const isSelected = selectedPath === item.path;

      if (item.isDirectory) {
        const isCreatingInside = creatingDir === item.path && creatingType !== null;

        return (
          <div key={item.path} className="tree-node">
            <div
              className={`tree-row folder-row ${isSelected ? "selected" : ""}`}
              style={{ paddingLeft: `${depth * 14 + 8}px` }}
              onClick={(e) => handleFolderClick(e, item)}
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
          className={`tree-row file-row ${isSelected ? "selected" : ""}`}
          style={{ paddingLeft: `${depth * 14 + 22}px` }}
          onClick={(e) => handleFileClick(e, item)}
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

  const isCreatingInRoot = creatingDir === projectPath && creatingType !== null;

  return (
    <div className="file-explorer-root">
      <div className="explorer-toolbar">
        <span className="toolbar-title">原稿ファイル</span>
        <div className="toolbar-actions">
          <button
            type="button"
            className="tool-btn"
            onClick={handleCreateNextFile}
            title={`新規ファイル作成 (${createTargetDescription} に自動推測作成して開く)`}
          >
            <FilePlus size={15} />
          </button>
          <button
            type="button"
            className="tool-btn"
            onClick={handleStartCreateFolder}
            title={`新規フォルダー作成 (${createTargetDescription})`}
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

      <div className="explorer-tree-container" onClick={handleBackgroundClick}>
        {isCreatingInRoot && renderInlineCreateInput(0)}
        {entries.length === 0 && !isLoading && !isCreatingInRoot ? (
          <p className="no-files-text">ファイルがありません</p>
        ) : (
          renderTree(entries)
        )}
      </div>
    </div>
  );
};
