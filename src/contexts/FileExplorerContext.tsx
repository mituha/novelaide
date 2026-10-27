import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { DirEntry } from '../types/document';
import { fileService } from '../services/fileService';
import { useProject } from './ProjectContext';
import { useDocument } from './DocumentContext';

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

function getParentDir(p: string): string {
  const norm = normalizePath(p);
  const lastSlash = norm.lastIndexOf('/');
  if (lastSlash === -1) return p;
  return p.substring(0, lastSlash);
}

function joinPath(dir: string, name: string): string {
  const isBackslash = dir.includes('\\');
  const sep = isBackslash ? '\\' : '/';
  return dir.endsWith(sep) ? `${dir}${name}` : `${dir}${sep}${name}`;
}

function isSubPathOrEqual(sub: string, parent: string): boolean {
  const nSub = normalizePath(sub).toLowerCase();
  const nParent = normalizePath(parent).toLowerCase();
  return nSub === nParent || nSub.startsWith(nParent.endsWith('/') ? nParent : `${nParent}/`);
}

interface FileExplorerContextType {
  entries: DirEntry[];
  expandedFolders: Set<string>;
  selectedPath: string | null;
  selectedIsDir: boolean;
  creatingDir: string | null;
  creatingType: 'file' | 'folder' | null;
  newItemName: string;
  isLoading: boolean;
  createTargetDescription: string;
  projectName: string;
  toggleFolder: (path: string) => void;
  expandFolder: (path: string) => void;
  selectItem: (path: string | null, isDir?: boolean) => void;
  setNewItemName: (name: string) => void;
  createNextFile: () => Promise<void>;
  startCreateFolder: () => void;
  cancelCreate: () => void;
  submitCreate: () => Promise<void>;
  refreshDirectory: () => Promise<void>;
  deleteItem: (entry: DirEntry) => Promise<void>;
  openFile: (file: DirEntry) => void;
}

const FileExplorerContext = createContext<FileExplorerContextType | null>(null);

export const FileExplorerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { projectPath } = useProject();
  const { openDocument, activePath } = useDocument();

  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedIsDir, setSelectedIsDir] = useState<boolean>(false);

  const [creatingDir, setCreatingDir] = useState<string | null>(null);
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null);
  const [newItemName, setNewItemName] = useState('');

  // プロジェクトディレクトリの読み込み
  const refreshDirectory = useCallback(async () => {
    if (!projectPath) {
      setEntries([]);
      return;
    }
    setIsLoading(true);
    try {
      const data = await fileService.readDirectory(projectPath, true);
      setEntries(data);
    } catch (err) {
      console.error('ディレクトリ読み込みエラー:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    refreshDirectory();
  }, [refreshDirectory]);

  // アクティブドキュメントの同期
  useEffect(() => {
    if (activePath) {
      setSelectedPath(activePath);
      setSelectedIsDir(false);
    }
  }, [activePath]);

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const expandFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => new Set(prev).add(path));
  }, []);

  const selectItem = useCallback((path: string | null, isDir = false) => {
    setSelectedPath(path);
    setSelectedIsDir(isDir);
  }, []);

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

  // プロジェクト名（末尾フォルダ名）の解決
  const projectName = useMemo(() => {
    if (!projectPath) return '作品フォルダー';
    const norm = normalizePath(projectPath);
    const parts = norm.split('/');
    return parts[parts.length - 1] || '作品フォルダー';
  }, [projectPath]);

  // ターゲットヒント
  const createTargetDescription = useMemo(() => {
    if (!projectPath) return '';
    if (selectedPath) {
      if (selectedIsDir) {
        const folderName = selectedPath.split(/[/\\]/).pop() || selectedPath;
        return `選択フォルダー「${folderName}」内`;
      }
      const parent = getParentDir(selectedPath);
      const parentName = parent.split(/[/\\]/).pop() || 'ルート';
      return `「${parentName}」階層内`;
    }
    return 'プロジェクトルート直下';
  }, [projectPath, selectedPath, selectedIsDir]);

  // 新規ファイル即時作成
  const createNextFile = useCallback(async () => {
    const targetDir = resolveTargetDir();
    if (!targetDir) return;

    try {
      const newEntry = await fileService.createNextFile(targetDir);

      if (targetDir !== projectPath) {
        expandFolder(targetDir);
      }

      await refreshDirectory();

      setSelectedPath(newEntry.path);
      setSelectedIsDir(false);
      openDocument(newEntry.path);
    } catch (err) {
      alert(`新規ファイルの作成に失敗しました: ${err}`);
    }
  }, [resolveTargetDir, projectPath, expandFolder, refreshDirectory, openDocument]);

  // 新規フォルダ作成の開始
  const startCreateFolder = useCallback(() => {
    const targetDir = resolveTargetDir();
    if (!targetDir) return;

    if (targetDir !== projectPath) {
      expandFolder(targetDir);
    }

    setCreatingDir(targetDir);
    setCreatingType('folder');
    setNewItemName('');
  }, [resolveTargetDir, projectPath, expandFolder]);

  const cancelCreate = useCallback(() => {
    setCreatingDir(null);
    setCreatingType(null);
    setNewItemName('');
  }, []);

  const submitCreate = useCallback(async () => {
    if (!newItemName.trim() || !creatingDir) return;

    const targetPath = joinPath(creatingDir, newItemName.trim());
    const type = creatingType;

    try {
      if (type === 'folder') {
        await fileService.createDirectory(targetPath);
      } else {
        await fileService.createFile(targetPath);
      }

      setCreatingDir(null);
      setCreatingType(null);
      setNewItemName('');
      await refreshDirectory();

      setSelectedPath(targetPath);
      setSelectedIsDir(type === 'folder');

      if (type === 'folder') {
        expandFolder(targetPath);
      }
    } catch (err) {
      alert(`作成に失敗しました: ${err}`);
    }
  }, [newItemName, creatingDir, creatingType, refreshDirectory, expandFolder]);

  const deleteItem = useCallback(async (entry: DirEntry) => {
    if (confirm(`「${entry.name}」を削除してもよろしいですか？`)) {
      try {
        await fileService.remove(entry.path);
        if (selectedPath === entry.path) {
          setSelectedPath(null);
          setSelectedIsDir(false);
        }
        await refreshDirectory();
      } catch (err) {
        alert(`削除に失敗しました: ${err}`);
      }
    }
  }, [selectedPath, refreshDirectory]);

  const openFile = useCallback((file: DirEntry) => {
    if (!file.isDirectory) {
      setSelectedPath(file.path);
      setSelectedIsDir(false);
      openDocument(file.path);
    }
  }, [openDocument]);

  const value = {
    entries,
    expandedFolders,
    selectedPath,
    selectedIsDir,
    creatingDir,
    creatingType,
    newItemName,
    isLoading,
    createTargetDescription,
    projectName,
    toggleFolder,
    expandFolder,
    selectItem,
    setNewItemName,
    createNextFile,
    startCreateFolder,
    cancelCreate,
    submitCreate,
    refreshDirectory,
    deleteItem,
    openFile,
  };

  return (
    <FileExplorerContext.Provider value={value}>
      {children}
    </FileExplorerContext.Provider>
  );
};

export const useFileExplorer = (): FileExplorerContextType => {
  const context = useContext(FileExplorerContext);
  if (!context) {
    throw new Error('useFileExplorer must be used within a FileExplorerProvider');
  }
  return context;
};
