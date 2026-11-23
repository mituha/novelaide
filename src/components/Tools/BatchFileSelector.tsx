import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Folder, Filter, CheckSquare, Square, Search, RefreshCw } from 'lucide-react';
import { fileService } from '../../services/fileService';
import { DirEntry } from '../../types/document';
import { BatchFileItem } from '../../types/batchTool';

interface BatchFileSelectorProps {
  projectPath: string;
  targetDir: string;
  onTargetDirChange: (dir: string) => void;
  onSelectedFilesChange: (files: BatchFileItem[]) => void;
  refreshTrigger?: number;
}

export const BatchFileSelector: React.FC<BatchFileSelectorProps> = ({
  projectPath,
  targetDir,
  onTargetDirChange,
  onSelectedFilesChange,
  refreshTrigger = 0,
}) => {
  const [folderOptions, setFolderOptions] = useState<{ label: string; value: string }[]>([]);
  const [allEntries, setAllEntries] = useState<DirEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedExtension, setSelectedExtension] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMap, setSelectedMap] = useState<Record<string, boolean>>({});

  // プロジェクト内のディレクトリおよび全エントリのスキャン
  const scanProjectEntries = useCallback(async () => {
    if (!projectPath) return;
    setIsLoading(true);
    try {
      const entries = await fileService.readDirectory(projectPath, true);
      setAllEntries(entries);

      // ディレクトリ一覧の抽出（プロジェクトルートを含む）
      const dirs: { label: string; value: string }[] = [
        { label: '（プロジェクトルート全体）', value: projectPath },
      ];

      const extractDirs = (list: DirEntry[]) => {
        for (const item of list) {
          if (item.isDirectory) {
            const rel = item.relativePath || item.name;
            dirs.push({
              label: rel.replace(/\\/g, '/'),
              value: item.path,
            });
            if (item.children) {
              extractDirs(item.children);
            }
          }
        }
      };
      extractDirs(entries);

      setFolderOptions(dirs);
      if (!targetDir) {
        onTargetDirChange(projectPath);
      }
    } catch (e) {
      console.error('[BatchFileSelector] Failed to scan project entries:', e);
    } finally {
      setIsLoading(false);
    }
  }, [projectPath, targetDir, onTargetDirChange]);

  useEffect(() => {
    scanProjectEntries();
  }, [scanProjectEntries, refreshTrigger]);

  // 指定フォルダー配下のフラットなファイル一覧を抽出
  const rawFiles = useMemo<BatchFileItem[]>(() => {
    if (!projectPath || !allEntries.length) return [];
    const currentTarget = targetDir || projectPath;

    const files: BatchFileItem[] = [];

    const collectFiles = (list: DirEntry[]) => {
      for (const item of list) {
        if (item.isDirectory) {
          if (item.children) {
            collectFiles(item.children);
          }
        } else {
          // targetDir 配下（またはそのもの）にあるか判定
          const isUnderTarget =
            fileService.isSamePath(item.parentDir, currentTarget) ||
            fileService.isSubPath(currentTarget, item.path);

          if (isUnderTarget) {
            const ext = item.extension?.toLowerCase().replace(/^\./, '') || '';
            const rel = fileService.getRelativePath(projectPath, item.path).replace(/\\/g, '/');
            files.push({
              name: item.name,
              path: item.path,
              relativePath: rel,
              extension: ext,
              selected: true,
              size: (item as any).size,
              mtimeMs: (item as any).mtimeMs,
            });
          }
        }
      }
    };

    collectFiles(allEntries);

    // 自然順ソート（数字付きファイル名対応）
    return files.sort((a, b) =>
      a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [projectPath, targetDir, allEntries]);

  // 存在する拡張子一覧の自動収集
  const availableExtensions = useMemo(() => {
    const extSet = new Set<string>();
    rawFiles.forEach((f) => {
      if (f.extension) extSet.add(f.extension);
    });
    return Array.from(extSet).sort();
  }, [rawFiles]);

  // フィルター後の表示用ファイル一覧
  const filteredFiles = useMemo(() => {
    return rawFiles.filter((file) => {
      // 拡張子フィルター
      if (selectedExtension !== 'all' && file.extension !== selectedExtension) {
        return false;
      }
      // 検索フィルター
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        return (
          file.name.toLowerCase().includes(query) ||
          file.relativePath.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [rawFiles, selectedExtension, searchQuery]);

  // 選択状態の同期
  const itemsWithSelection = useMemo<BatchFileItem[]>(() => {
    return filteredFiles.map((file) => ({
      ...file,
      selected: selectedMap[file.path] !== undefined ? selectedMap[file.path] : true,
    }));
  }, [filteredFiles, selectedMap]);

  // 親コンポーネントへ選択中ファイルのリストを伝達
  useEffect(() => {
    const selected = itemsWithSelection.filter((f) => f.selected);
    onSelectedFilesChange(selected);
  }, [itemsWithSelection, onSelectedFilesChange]);

  // 単一チェックボックス切り替え
  const handleToggleFile = useCallback((path: string) => {
    setSelectedMap((prev) => {
      const current = prev[path] !== undefined ? prev[path] : true;
      return {
        ...prev,
        [path]: !current,
      };
    });
  }, []);

  // 全選択 / 全解除
  const handleSelectAll = useCallback(
    (select: boolean) => {
      setSelectedMap((prev) => {
        const next = { ...prev };
        filteredFiles.forEach((f) => {
          next[f.path] = select;
        });
        return next;
      });
    },
    [filteredFiles]
  );

  const selectedCount = itemsWithSelection.filter((f) => f.selected).length;
  const isAllSelected = filteredFiles.length > 0 && selectedCount === filteredFiles.length;

  return (
    <div className="batch-file-selector">
      {/* 1. フォルダー選択 */}
      <div className="batch-selector-row">
        <label className="batch-selector-label">
          <Folder size={14} className="batch-icon" />
          <span>対象フォルダー:</span>
        </label>
        <div className="batch-folder-select-wrap">
          <select
            className="batch-select-input"
            value={targetDir}
            onChange={(e) => onTargetDirChange(e.target.value)}
          >
            {folderOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            className="batch-btn-icon"
            onClick={scanProjectEntries}
            title="ファイルを再読み込み"
            disabled={isLoading}
          >
            <RefreshCw size={13} className={isLoading ? 'batch-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 2. 拡張子 & 検索フィルター */}
      <div className="batch-filter-row">
        <div className="batch-ext-filter">
          <Filter size={13} className="batch-icon" />
          <select
            className="batch-ext-select"
            value={selectedExtension}
            onChange={(e) => setSelectedExtension(e.target.value)}
          >
            <option value="all">すべての拡張子 ({rawFiles.length})</option>
            {availableExtensions.map((ext) => {
              const count = rawFiles.filter((f) => f.extension === ext).length;
              return (
                <option key={ext} value={ext}>
                  .{ext} ({count}件)
                </option>
              );
            })}
          </select>
        </div>

        <div className="batch-search-wrap">
          <Search size={13} className="batch-icon-search" />
          <input
            type="text"
            className="batch-search-input"
            placeholder="ファイル名絞り込み..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* 3. ファイル一覧ヘッダー（全選択・選択件数） */}
      <div className="batch-list-header">
        <button
          className="batch-check-all-btn"
          onClick={() => handleSelectAll(!isAllSelected)}
        >
          {isAllSelected ? (
            <CheckSquare size={14} className="batch-checkbox-checked" />
          ) : (
            <Square size={14} className="batch-checkbox-unchecked" />
          )}
          <span>全選択 ({selectedCount} / {filteredFiles.length} 件選択中)</span>
        </button>
      </div>

      {/* 4. ファイル一覧リスト */}
      <div className="batch-file-list">
        {filteredFiles.length === 0 ? (
          <div className="batch-empty-message">
            {isLoading ? 'ファイルをスキャン中...' : '対象となるファイルが見つかりません'}
          </div>
        ) : (
          filteredFiles.map((file) => {
            const isSelected = selectedMap[file.path] !== undefined ? selectedMap[file.path] : true;
            return (
              <div
                key={file.path}
                className={`batch-file-item ${isSelected ? 'selected' : 'unselected'}`}
                onClick={() => handleToggleFile(file.path)}
              >
                <div className="batch-file-checkbox">
                  {isSelected ? (
                    <CheckSquare size={14} className="batch-checkbox-checked" />
                  ) : (
                    <Square size={14} className="batch-checkbox-unchecked" />
                  )}
                </div>
                <div className="batch-file-details">
                  <span className="batch-file-name" title={file.relativePath}>
                    {file.relativePath}
                  </span>
                </div>
                <span className="batch-ext-badge">.{file.extension || 'none'}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
