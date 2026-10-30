import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { listen } from '@tauri-apps/api/event';
import { FsChangeEvent } from 'tauri-plugin-novelaid-fs-api';
import { DirEntry } from '../types/document';
import { fileService } from '../services/fileService';
import { useProject } from './ProjectContext';
import { useDocument } from './DocumentContext';
import { useNotification } from './NotificationContext';

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

function findEntryByPath(items: DirEntry[], targetPath: string): DirEntry | null {
  const normTarget = normalizePath(targetPath);
  for (const item of items) {
    if (normalizePath(item.path) === normTarget) return item;
    if (item.children) {
      const found = findEntryByPath(item.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

function countEntries(items: DirEntry[]): { files: number; folders: number } {
  let files = 0;
  let folders = 0;
  for (const item of items) {
    if (item.isDirectory) {
      folders++;
      if (item.children) {
        const sub = countEntries(item.children);
        files += sub.files;
        folders += sub.folders;
      }
    } else {
      files++;
    }
  }
  return { files, folders };
}

function getUniqueCopyPath(items: DirEntry[], targetDir: string, originalName: string, isDir: boolean): string {
  const isBackslash = targetDir.includes('\\');
  const sep = isBackslash ? '\\' : '/';

  let baseName = originalName;
  let ext = '';
  if (!isDir) {
    const dotIdx = originalName.lastIndexOf('.');
    if (dotIdx > 0) {
      baseName = originalName.substring(0, dotIdx);
      ext = originalName.substring(dotIdx);
    }
  }

  let candidateName = `${baseName} - コピー${ext}`;
  let candidatePath = targetDir.endsWith(sep) ? `${targetDir}${candidateName}` : `${targetDir}${sep}${candidateName}`;
  let counter = 2;

  while (findEntryByPath(items, candidatePath)) {
    candidateName = `${baseName} - コピー (${counter})${ext}`;
    candidatePath = targetDir.endsWith(sep) ? `${targetDir}${candidateName}` : `${targetDir}${sep}${candidateName}`;
    counter++;
  }

  return candidatePath;
}

export interface ContextMenuState {
  x: number;
  y: number;
  entry: DirEntry;
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
  renamingPath: string | null;
  renamingName: string;
  contextMenu: ContextMenuState | null;

  toggleFolder: (path: string) => void;
  expandFolder: (path: string) => void;
  selectItem: (path: string | null, isDir?: boolean) => void;
  setNewItemName: (name: string) => void;
  createNextFile: () => Promise<void>;
  startCreateFolder: () => void;
  cancelCreate: () => void;
  submitCreate: () => Promise<void>;
  refreshDirectory: () => Promise<void>;
  deleteItem: (entry: DirEntry, force?: boolean) => Promise<void>;
  openFile: (file: DirEntry) => void;

  // リネーム関連
  setRenamingName: (name: string) => void;
  startRename: (entry: DirEntry) => void;
  cancelRename: () => void;
  submitRename: () => Promise<void>;

  // コンテキストメニュー関連
  openContextMenu: (e: React.MouseEvent, entry: DirEntry) => void;
  closeContextMenu: () => void;
  revealInExplorer: (entry: DirEntry) => Promise<void>;
  copyPath: (entry: DirEntry, relative?: boolean) => Promise<void>;

  // D&D 移動・コピー
  moveOrCopyItem: (sourcePath: string, targetDir: string, isCopy: boolean) => Promise<void>;

  // 手動アクティブファイル追従（同期）
  revealActiveFile: () => void;
  activePath: string | null;
}

const FileExplorerContext = createContext<FileExplorerContextType | null>(null);

export const FileExplorerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { projectPath } = useProject();
  const { openDocument, closeTab, activePath, openDocuments } = useDocument();
  const { showStatusMessage, confirmDialog, alertDialog } = useNotification();
  const isInitialScanRef = useRef(true);

  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedIsDir, setSelectedIsDir] = useState<boolean>(false);

  const [creatingDir, setCreatingDir] = useState<string | null>(null);
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null);
  const [newItemName, setNewItemName] = useState('');

  // リネーム状態
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState<string>('');

  // コンテキストメニュー状態
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // プロジェクトディレクトリの読み込み
  const refreshDirectory = useCallback(async (notify = false) => {
    if (!projectPath) {
      setEntries([]);
      return;
    }
    setIsLoading(true);
    if (notify) {
      showStatusMessage('フォルダをスキャン中...');
    }
    try {
      const data = await fileService.readDirectory(projectPath, true);
      setEntries(data);
      if (notify) {
        const { files, folders } = countEntries(data);
        showStatusMessage(`スキャン完了 (${files} ファイル / ${folders} フォルダ)`, 3000);
      }
    } catch (err) {
      console.error('ディレクトリ読み込みエラー:', err);
      if (notify) {
        showStatusMessage('フォルダのスキャンに失敗しました', 4000);
      }
    } finally {
      setIsLoading(false);
    }
  }, [projectPath, showStatusMessage]);

  useEffect(() => {
    const isInitial = isInitialScanRef.current;
    if (isInitial) {
      isInitialScanRef.current = false;
    }
    refreshDirectory(true);
  }, [refreshDirectory]);

  // バックエンドからのファイル変更イベント（fs:changed）の自律購読
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<FsChangeEvent>('fs:changed', async (event) => {
      const { action, path, newPath } = event.payload;

      // 1. ディレクトリツリーの自律再読み込み
      await refreshDirectory();

      // 2. 削除時のタブクローズ & 選択解除
      if (action === 'delete') {
        setSelectedPath((current) => {
          if (current && isSubPathOrEqual(current, path)) {
            return null;
          }
          return current;
        });

        for (const doc of openDocuments) {
          if (isSubPathOrEqual(doc.path, path)) {
            await closeTab(doc.path);
          }
        }
      }

      // 3. リネーム時のタブ自動追従
      if (action === 'rename' && newPath) {
        for (const doc of openDocuments) {
          if (doc.path === path) {
            await closeTab(doc.path);
            await openDocument(newPath);
          } else if (isSubPathOrEqual(doc.path, path)) {
            const sub = doc.path.substring(path.length);
            const isBackslash = newPath.includes('\\');
            const updated = `${newPath}${sub.replace(/\//g, isBackslash ? '\\' : '/')}`;
            await closeTab(doc.path);
            await openDocument(updated);
          }
        }
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [refreshDirectory, openDocuments, closeTab, openDocument]);

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
      await alertDialog(`新規ファイルの作成に失敗しました: ${err}`);
    }
  }, [resolveTargetDir, projectPath, expandFolder, refreshDirectory, openDocument, alertDialog]);

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
      await alertDialog(`作成に失敗しました: ${err}`);
    }
  }, [newItemName, creatingDir, creatingType, refreshDirectory, expandFolder, alertDialog]);

  const deleteItem = useCallback(async (entry: DirEntry, force = false) => {
    try {
      // 1. バックエンドに削除を要求（バックエンドで存在確認・要確認判定を一元管理）
      const result = await fileService.remove(entry.path, force);

      // 2. バックエンドが確認必要と判定した場合
      if (result.status === 'needConfirm') {
        const itemType = result.isDirectory ? 'フォルダ' : 'ファイル';
        // 3. フロントエンドの NotificationContext を経由して Rust OS ダイアログを起動
        const confirmed = await confirmDialog({
          title: `${itemType}の削除確認`,
          message: `「${result.fileName}」を削除してもよろしいですか？\nこの操作は取り消せません。`,
          kind: 'warning',
          okLabel: '削除',
          cancelLabel: 'キャンセル',
        });

        if (!confirmed) {
          // ユーザーがキャンセル
          return;
        }

        // 4. 承認された場合、force=true で確定削除を実行
        const finalResult = await fileService.remove(entry.path, true);
        if (finalResult.status === 'success') {
          showStatusMessage(`「${result.fileName}」を削除しました`);
        }
      } else if (result.status === 'success') {
        showStatusMessage(`「${entry.name}」を削除しました`);
      } else if (result.status === 'notFound') {
        await alertDialog(`対象のファイルまたはフォルダが見つかりません: ${entry.path}`);
      }
    } catch (err) {
      await alertDialog(`削除に失敗しました: ${err}`);
    }
  }, [confirmDialog, showStatusMessage, alertDialog]);

  const openFile = useCallback((file: DirEntry) => {
    if (!file.isDirectory) {
      setSelectedPath(file.path);
      setSelectedIsDir(false);
      openDocument(file.path);
    }
  }, [openDocument]);

  // --- リネーム機能 ---
  const startRename = useCallback((entry: DirEntry) => {
    setRenamingPath(entry.path);
    setRenamingName(entry.name);
    setSelectedPath(entry.path);
    setSelectedIsDir(entry.isDirectory);
  }, []);

  const cancelRename = useCallback(() => {
    setRenamingPath(null);
    setRenamingName('');
  }, []);

  const submitRename = useCallback(async () => {
    if (!renamingPath || !renamingName.trim()) {
      cancelRename();
      return;
    }

    const currentEntry = entries.find((e) => e.path === renamingPath);
    if (currentEntry && currentEntry.name === renamingName.trim()) {
      cancelRename();
      return;
    }

    const parent = getParentDir(renamingPath);
    const newPath = joinPath(parent, renamingName.trim());
    const oldPath = renamingPath;

    try {
      await fileService.rename(oldPath, newPath);

      // 開いていたタブがあればパスを追従（閉じてから開く）
      const isOpen = openDocuments.some((doc) => doc.path === oldPath);
      if (isOpen) {
        await closeTab(oldPath);
        await openDocument(newPath);
      }

      cancelRename();
      await refreshDirectory();
      setSelectedPath(newPath);
    } catch (err) {
      await alertDialog(`名前の変更に失敗しました: ${err}`);
    }
  }, [renamingPath, renamingName, entries, openDocuments, closeTab, openDocument, cancelRename, refreshDirectory, alertDialog]);

  // --- コンテキストメニュー機能 ---
  const openContextMenu = useCallback((e: React.MouseEvent, entry: DirEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedPath(entry.path);
    setSelectedIsDir(entry.isDirectory);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      entry,
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const revealInExplorer = useCallback(async (entry: DirEntry) => {
    try {
      await revealItemInDir(entry.path);
    } catch (err) {
      console.warn('revealItemInDir error:', err);
    }
  }, []);

  const copyPath = useCallback(async (entry: DirEntry, relative = false) => {
    let textToCopy = entry.path;
    if (relative && projectPath) {
      const normPath = normalizePath(entry.path);
      const normProj = normalizePath(projectPath);
      if (normPath.startsWith(normProj)) {
        textToCopy = normPath.substring(normProj.length).replace(/^\//, '');
      }
    }
    try {
      await navigator.clipboard.writeText(textToCopy);
    } catch (err) {
      console.warn('clipboard copy failed:', err);
    }
  }, [projectPath]);

  // --- D&D 移動・コピー ---
  const moveOrCopyItem = useCallback(
    async (sourcePath: string, targetDir: string, isCopy: boolean) => {
      if (!projectPath || !sourcePath || !targetDir) return;

      const normSource = normalizePath(sourcePath);
      const normTarget = normalizePath(targetDir);

      const sourceEntry = findEntryByPath(entries, sourcePath);
      const isDir = sourceEntry ? sourceEntry.isDirectory : false;

      // ガード1: 自身への操作
      if (normSource === normTarget) {
        return;
      }

      // ガード2: フォルダ自身、または自身の子孫フォルダへの移動・コピーは禁止
      if (isDir && isSubPathOrEqual(targetDir, sourcePath)) {
        await alertDialog('自身またはその配下のフォルダーには移動・コピーできません。');
        return;
      }

      // ガード3: 移動で、移動先がすでに現在の親フォルダである場合は何もしない
      const currentParent = normalizePath(getParentDir(sourcePath));
      if (!isCopy && currentParent === normTarget) {
        return;
      }

      const originalName = sourcePath.split(/[/\\]/).pop() || '';
      if (!originalName) return;

      const isBackslash = targetDir.includes('\\');
      const sep = isBackslash ? '\\' : '/';

      let destPath: string;
      if (isCopy) {
        destPath = getUniqueCopyPath(entries, targetDir, originalName, isDir);
      } else {
        destPath = targetDir.endsWith(sep) ? `${targetDir}${originalName}` : `${targetDir}${sep}${originalName}`;
        if (findEntryByPath(entries, destPath)) {
          await alertDialog(`移動先に同名のアイテム「${originalName}」が既に存在します。`);
          return;
        }
      }

      try {
        if (isCopy) {
          await fileService.copy(sourcePath, destPath);
        } else {
          await fileService.rename(sourcePath, destPath);

          // 開いているエディタタブの追従
          for (const doc of openDocuments) {
            const normDoc = normalizePath(doc.path);
            if (isDir) {
              if (isSubPathOrEqual(doc.path, sourcePath)) {
                const sub = normDoc.substring(normSource.length);
                const updatedDocPath = `${destPath}${sub.replace(/\//g, isBackslash ? '\\' : '/')}`;
                await closeTab(doc.path);
                await openDocument(updatedDocPath);
              }
            } else if (normDoc === normSource) {
              await closeTab(doc.path);
              await openDocument(destPath);
            }
          }
        }

        // 移動・コピー先を展開
        if (targetDir !== projectPath) {
          expandFolder(targetDir);
        }

        await refreshDirectory();
        setSelectedPath(destPath);
        setSelectedIsDir(isDir);
      } catch (err) {
        await alertDialog(`${isCopy ? 'コピー' : '移動'}に失敗しました: ${err}`);
      }
    },
    [projectPath, entries, openDocuments, closeTab, openDocument, expandFolder, refreshDirectory, alertDialog]
  );

  // --- 手動アクティブファイル追従（同期） ---
  const revealActiveFile = useCallback(() => {
    if (!activePath || !projectPath) return;

    const normActive = normalizePath(activePath);
    const normProj = normalizePath(projectPath);

    if (normActive.startsWith(normProj)) {
      const relative = normActive.substring(normProj.length).replace(/^\//, '');
      const parts = relative.split('/');
      parts.pop(); // ファイル名を除く

      let current = normProj;
      const foldersToExpand: string[] = [];
      for (const part of parts) {
        current = `${current}/${part}`;
        foldersToExpand.push(current);
      }

      setExpandedFolders((prev) => {
        const next = new Set(prev);
        foldersToExpand.forEach((f) => {
          next.add(f);
          next.add(f.replace(/\//g, '\\'));
        });
        return next;
      });
    }

    setSelectedPath(activePath);
    setSelectedIsDir(false);

    setTimeout(() => {
      // 該当ツリー行のスクロール
      const targetElement = document.querySelector(`[data-tree-path="${CSS.escape(activePath)}"]`);
      if (targetElement) {
        targetElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 60);
  }, [activePath, projectPath]);

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
    renamingPath,
    renamingName,
    contextMenu,
    activePath,

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

    setRenamingName,
    startRename,
    cancelRename,
    submitRename,

    openContextMenu,
    closeContextMenu,
    revealInExplorer,
    copyPath,

    moveOrCopyItem,
    revealActiveFile,
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
