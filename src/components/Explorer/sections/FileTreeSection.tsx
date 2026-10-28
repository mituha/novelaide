import React from 'react';
import { FilePlus, FolderPlus, RefreshCw, Locate } from 'lucide-react';
import { ExplorerSectionProps } from '../../../types/explorerPlugin';
import { FileExplorer } from '../../FileExplorer/FileExplorer';
import { useFileExplorer } from '../../../contexts/FileExplorerContext';

export const FileTreeHeaderActions: React.FC<{ sectionId: string }> = () => {
  const {
    createNextFile,
    startCreateFolder,
    refreshDirectory,
    isLoading,
    createTargetDescription,
    revealActiveFile,
    activePath,
  } = useFileExplorer();

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: '2px' }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="explorer-action-btn"
        onClick={createNextFile}
        title={`新規ファイル作成 (${createTargetDescription} に自動推測作成して開く)`}
      >
        <FilePlus size={13} />
      </button>
      <button
        type="button"
        className="explorer-action-btn"
        onClick={startCreateFolder}
        title={`新規フォルダー作成 (${createTargetDescription})`}
      >
        <FolderPlus size={13} />
      </button>
      <button
        type="button"
        className={`explorer-action-btn ${isLoading ? 'spinning' : ''}`}
        onClick={refreshDirectory}
        title="ファイル一覧の再読み込み"
      >
        <RefreshCw size={13} />
      </button>
      <button
        type="button"
        className="explorer-action-btn"
        onClick={revealActiveFile}
        title="編集中ファイルをエクスプローラーで表示 (同期)"
        disabled={!activePath}
        style={{ opacity: activePath ? 1 : 0.4 }}
      >
        <Locate size={13} />
      </button>
    </div>
  );
};

export const FileTreeSection: React.FC<ExplorerSectionProps> = ({ projectPath }) => {
  return (
    <div style={{ width: '100%' }}>
      <FileExplorer projectPath={projectPath} showToolbar={false} />
    </div>
  );
};
