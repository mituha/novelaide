import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  GitBranch,
  RefreshCw,
  Plus,
  Minus,
  Check,
  Undo2,
  ChevronDown,
  ChevronRight,
  GitCommit,
  FolderGit2,
  UploadCloud,
} from 'lucide-react';
import { useGit } from '../../contexts/GitContext';
import { GitGraph } from './GitGraph';
import './GitPanel.css';

interface GitPanelProps {
  onOpenFileDiff?: (filePath: string, staged: boolean) => void;
}

interface ResizeState {
  sectionAboveId: string;
  sectionBelowId: string;
  initialHeightAbove: number;
  initialHeightBelow: number;
  totalWeight: number;
  startY: number;
}

export const GitPanel: React.FC<GitPanelProps> = ({ onOpenFileDiff }) => {
  const {
    isRepo,
    currentBranch,
    remotes,
    staged,
    unstaged,
    untracked,
    history,
    isLoading,
    isPushing,
    refresh,
    initRepo,
    stageFiles,
    unstageFiles,
    commit,
    push,
    discardFile,
  } = useGit();

  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [selectedRemote, setSelectedRemote] = useState<string>('origin');

  useEffect(() => {
    if (remotes.length > 0) {
      if (!remotes.includes(selectedRemote)) {
        setSelectedRemote(remotes[0]);
      }
    }
  }, [remotes, selectedRemote]);

  const handlePush = async () => {
    if (isPushing) return;
    try {
      await push(selectedRemote, currentBranch);
    } catch (e) {
      console.error('[GitPanel] Push failed:', e);
    }
  };

  // アコーディオン開閉状態
  const [expandedStaged, setExpandedStaged] = useState(true);
  const [expandedChanges, setExpandedChanges] = useState(true);
  const [expandedHistory, setExpandedHistory] = useState(true);

  // 各セクションの高さウェイト (複数展開時のflex-grow比率)
  const [weights, setWeights] = useState<Record<string, number>>({
    staged: 1,
    changes: 1,
    history: 1,
  });

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const resizeStateRef = useRef<ResizeState | null>(null);

  // 未ステージと未追跡の合算
  const allChanges = [...unstaged, ...untracked];

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    setIsCommitting(true);
    try {
      // ステージ済みがない場合は、全変更をステージしてコミット
      const stageAll = staged.length === 0;
      await commit(commitMessage.trim(), stageAll);
      setCommitMessage('');
    } catch (e) {
      console.error('[GitPanel] Commit failed:', e);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleCommit();
    }
  };

  // ドラッグリサイズ処理
  const handleResizeStart = useCallback(
    (e: React.MouseEvent, sectionAboveId: string, sectionBelowId: string) => {
      e.preventDefault();
      const elAbove = sectionRefs.current[sectionAboveId];
      const elBelow = sectionRefs.current[sectionBelowId];
      if (!elAbove || !elBelow) return;

      const rectAbove = elAbove.getBoundingClientRect();
      const rectBelow = elBelow.getBoundingClientRect();

      const wAbove = weights[sectionAboveId] ?? 1;
      const wBelow = weights[sectionBelowId] ?? 1;
      const totalWeight = wAbove + wBelow;

      resizeStateRef.current = {
        sectionAboveId,
        sectionBelowId,
        initialHeightAbove: rectAbove.height,
        initialHeightBelow: rectBelow.height,
        totalWeight,
        startY: e.clientY,
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!resizeStateRef.current) return;
        const {
          sectionAboveId: aboveId,
          sectionBelowId: belowId,
          initialHeightAbove,
          initialHeightBelow,
          totalWeight: totalW,
          startY,
        } = resizeStateRef.current;

        const deltaY = moveEvent.clientY - startY;
        const totalH = initialHeightAbove + initialHeightBelow;
        const minHeight = 48; // 最小高さ

        const clampedHeightAbove = Math.max(
          minHeight,
          Math.min(totalH - minHeight, initialHeightAbove + deltaY)
        );
        const clampedHeightBelow = totalH - clampedHeightAbove;

        const ratioAbove = clampedHeightAbove / totalH;
        const ratioBelow = clampedHeightBelow / totalH;

        setWeights((prev) => ({
          ...prev,
          [aboveId]: ratioAbove * totalW,
          [belowId]: ratioBelow * totalW,
        }));
      };

      const handleMouseUp = () => {
        resizeStateRef.current = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.classList.remove('git-resizing');
      };

      document.body.classList.add('git-resizing');
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [weights]
  );

  if (!isRepo) {
    return (
      <div className="git-panel-container">
        <div className="git-empty-state">
          <FolderGit2 size={36} className="git-empty-icon" />
          <p>この作品フォルダーはGitリポジトリとして初期化されていません。</p>
          <button type="button" className="git-init-btn" onClick={initRepo}>
            Git リポジトリを初期化 (git init)
          </button>
        </div>
      </div>
    );
  }

  // 展開中のセクションID一覧
  const sectionDefs = [
    { id: 'staged', isExpanded: expandedStaged },
    { id: 'changes', isExpanded: expandedChanges },
    { id: 'history', isExpanded: expandedHistory },
  ];
  const expandedSectionIds = sectionDefs.filter((s) => s.isExpanded).map((s) => s.id);

  // staged の下にリサイザーが必要か（stagedが展開されており、その後に展開中のセクションがあるか）
  const canResizeAfterStaged =
    expandedStaged &&
    expandedSectionIds.filter((id) => id === 'changes' || id === 'history').length > 0;
  const nextExpandedAfterStaged = expandedSectionIds.find(
    (id) => id === 'changes' || id === 'history'
  );

  // changes の下にリサイザーが必要か
  const canResizeAfterChanges =
    expandedChanges && expandedSectionIds.includes('history');

  return (
    <div className="git-panel-container">
      {/* ヘッダー */}
      <div className="git-panel-header">
        <div className="git-branch-info">
          <GitBranch size={14} />
          <span>{currentBranch || 'HEAD'}</span>
        </div>
        <div className="git-header-actions">
          {remotes.length > 0 && (
            <button
              type="button"
              className={`git-action-icon-btn ${isPushing ? 'spinning' : ''}`}
              onClick={handlePush}
              title={`リモートへプッシュ (${selectedRemote}/${currentBranch || 'HEAD'})`}
              disabled={isPushing || isLoading}
            >
              {isPushing ? <RefreshCw size={14} /> : <UploadCloud size={14} />}
            </button>
          )}
          <button
            type="button"
            className={`git-action-icon-btn ${isLoading ? 'spinning' : ''}`}
            onClick={refresh}
            title="リポジトリ状態を更新"
            disabled={isLoading || isPushing}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* コミット入力フォーム */}
      <div className="git-commit-box">
        <textarea
          className="git-commit-input"
          placeholder="コミットメッセージを入力 (Ctrl+Enterでコミット)..."
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
        />
        <button
          type="button"
          className="git-commit-btn"
          onClick={handleCommit}
          disabled={
            !commitMessage.trim() ||
            isCommitting ||
            (staged.length === 0 && allChanges.length === 0)
          }
        >
          <Check size={14} />
          <span>{staged.length > 0 ? 'Commit (Staged)' : 'Commit All'}</span>
        </button>

        {/* Push コントロール */}
        {remotes.length > 0 && (
          <div className="git-push-row">
            {remotes.length > 1 ? (
              <select
                className="git-remote-select"
                value={selectedRemote}
                onChange={(e) => setSelectedRemote(e.target.value)}
                disabled={isPushing}
                title="プッシュ先リモートを選択"
              >
                {remotes.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            ) : (
              <span className="git-remote-badge" title="プッシュ先リモート">
                {selectedRemote}
              </span>
            )}
            <button
              type="button"
              className="git-push-btn"
              onClick={handlePush}
              disabled={isPushing || isLoading}
              title={`リモート (${selectedRemote}) にコミットをプッシュ`}
            >
              {isPushing ? (
                <>
                  <RefreshCw size={13} className="spinning" />
                  <span>Pushing...</span>
                </>
              ) : (
                <>
                  <UploadCloud size={13} />
                  <span>Push</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ボディ（アコーディオンリスト） */}
      <div className="git-panel-body">
        {/* Staged Changes セクション */}
        <div
          ref={(el) => {
            sectionRefs.current['staged'] = el;
          }}
          className={`git-section ${expandedStaged ? 'expanded' : 'collapsed'}`}
          style={expandedStaged ? { flex: `${weights.staged ?? 1} 1 0px` } : undefined}
        >
          <div
            className="git-section-header"
            onClick={() => setExpandedStaged((prev) => !prev)}
          >
            <div className="git-section-title">
              {expandedStaged ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>STAGED CHANGES</span>
              <span className="git-badge">{staged.length}</span>
            </div>
            {staged.length > 0 && (
              <div
                className="git-section-actions"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="git-action-icon-btn"
                  onClick={() => unstageFiles([])}
                  title="すべてアンステージ (git reset)"
                >
                  <Minus size={13} />
                </button>
              </div>
            )}
          </div>

          {expandedStaged && (
            <div className="git-section-list">
              {staged.map((file) => (
                <div
                  key={`staged-${file.path}`}
                  className="git-file-row"
                  onClick={() => onOpenFileDiff?.(file.path, true)}
                >
                  <div className="git-file-info">
                    <span className={`git-file-badge ${file.status[0]}`}>
                      {file.status[0].toUpperCase()}
                    </span>
                    <span className="git-file-name" title={file.path}>
                      {file.path}
                    </span>
                  </div>
                  <div
                    className="git-file-actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="git-action-icon-btn"
                      onClick={() => unstageFiles([file.path])}
                      title="アンステージ"
                    >
                      <Minus size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {canResizeAfterStaged && nextExpandedAfterStaged && (
          <div
            className="git-section-resizer"
            onMouseDown={(e) => handleResizeStart(e, 'staged', nextExpandedAfterStaged)}
            title="セクションの高さを変更"
          />
        )}

        {/* Changes セクション */}
        <div
          ref={(el) => {
            sectionRefs.current['changes'] = el;
          }}
          className={`git-section ${expandedChanges ? 'expanded' : 'collapsed'}`}
          style={expandedChanges ? { flex: `${weights.changes ?? 1} 1 0px` } : undefined}
        >
          <div
            className="git-section-header"
            onClick={() => setExpandedChanges((prev) => !prev)}
          >
            <div className="git-section-title">
              {expandedChanges ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>CHANGES</span>
              <span className="git-badge">{allChanges.length}</span>
            </div>
            {allChanges.length > 0 && (
              <div
                className="git-section-actions"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="git-action-icon-btn"
                  onClick={() => stageFiles([])}
                  title="すべてステージ (git add -A)"
                >
                  <Plus size={13} />
                </button>
              </div>
            )}
          </div>

          {expandedChanges && (
            <div className="git-section-list">
              {allChanges.map((file) => (
                <div
                  key={`unstaged-${file.path}`}
                  className="git-file-row"
                  onClick={() => onOpenFileDiff?.(file.path, false)}
                >
                  <div className="git-file-info">
                    <span
                      className={`git-file-badge ${
                        file.status === 'untracked' ? 'u' : file.status[0]
                      }`}
                    >
                      {file.status === 'untracked'
                        ? 'U'
                        : file.status[0].toUpperCase()}
                    </span>
                    <span className="git-file-name" title={file.path}>
                      {file.path}
                    </span>
                  </div>
                  <div
                    className="git-file-actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="git-action-icon-btn"
                      onClick={() => discardFile(file.path)}
                      title="変更を破棄 (元に戻す)"
                    >
                      <Undo2 size={13} />
                    </button>
                    <button
                      type="button"
                      className="git-action-icon-btn"
                      onClick={() => stageFiles([file.path])}
                      title="ステージに追加"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {canResizeAfterChanges && (
          <div
            className="git-section-resizer"
            onMouseDown={(e) => handleResizeStart(e, 'changes', 'history')}
            title="セクションの高さを変更"
          />
        )}

        {/* Commit History セクション */}
        <div
          ref={(el) => {
            sectionRefs.current['history'] = el;
          }}
          className={`git-section ${expandedHistory ? 'expanded' : 'collapsed'}`}
          style={expandedHistory ? { flex: `${weights.history ?? 1} 1 0px` } : undefined}
        >
          <div
            className="git-section-header"
            onClick={() => setExpandedHistory((prev) => !prev)}
          >
            <div className="git-section-title">
              {expandedHistory ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <GitCommit size={14} />
              <span>COMMIT HISTORY</span>
              <span className="git-badge">{history.length}</span>
            </div>
          </div>

          {expandedHistory && history.length > 0 && (
            <div className="git-history-container">
              <GitGraph history={history} />
              <div className="git-history-list">
                {history.map((commit) => (
                  <div
                    key={commit.hash}
                    className="git-history-item"
                    title={commit.message}
                  >
                    <div className="git-history-message">{commit.message}</div>
                    <div className="git-history-meta">
                      <span className="git-history-hash">
                        {commit.shortHash}
                      </span>
                      <span>{commit.authorName}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
