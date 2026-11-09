import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { gitClient, type GitFileStatus, type GitCommitLog, type GitDiffResult } from 'restar-app-git';
import { useProject } from './ProjectContext';
import { useNotification } from './NotificationContext';
import { bootLog, bootTimeStart } from '../utils/bootLogger';

interface GitContextType {
  isRepo: boolean;
  currentBranch: string;
  remotes: string[];
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: GitFileStatus[];
  history: GitCommitLog[];
  isLoading: boolean;
  isPushing: boolean;
  refresh: () => Promise<void>;
  initRepo: () => Promise<void>;
  stageFiles: (files?: string[]) => Promise<void>;
  unstageFiles: (files?: string[]) => Promise<void>;
  commit: (message: string, stageAll?: boolean) => Promise<string>;
  push: (remote?: string, branch?: string, setUpstream?: boolean) => Promise<string>;
  discardFile: (filePath: string) => Promise<void>;
  getDiff: (filePath: string, staged?: boolean) => Promise<GitDiffResult>;
}

const GitContext = createContext<GitContextType | undefined>(undefined);

export const GitProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { projectPath } = useProject();
  const { showToast } = useNotification();

  const [isRepo, setIsRepo] = useState(false);
  const [currentBranch, setCurrentBranch] = useState('');
  const [remotes, setRemotes] = useState<string[]>([]);
  const [staged, setStaged] = useState<GitFileStatus[]>([]);
  const [unstaged, setUnstaged] = useState<GitFileStatus[]>([]);
  const [untracked, setUntracked] = useState<GitFileStatus[]>([]);
  const [history, setHistory] = useState<GitCommitLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPushing, setIsPushing] = useState(false);

  // リポジトリ状態とログの再読み込み
  const refresh = useCallback(async () => {
    if (!projectPath) {
      setIsRepo(false);
      setRemotes([]);
      setStaged([]);
      setUnstaged([]);
      setUntracked([]);
      setHistory([]);
      return;
    }

    const endTimer = bootTimeStart(`Git refresh (${projectPath})`);
    setIsLoading(true);
    try {
      const hasRepo = await gitClient.isRepo(projectPath);
      bootLog(`Git isRepo check: ${hasRepo}`);
      setIsRepo(hasRepo);

      if (hasRepo) {
        const [repoStatus, logs, remoteList] = await Promise.all([
          gitClient.status(projectPath),
          gitClient.log(projectPath, 50),
          gitClient.getRemotes(projectPath),
        ]);

        bootLog(`Git status fetched: branch=${repoStatus.currentBranch}, remotes=${remoteList.length}, staged=${repoStatus.staged.length}, unstaged=${repoStatus.unstaged.length}, logs=${logs.length}`);
        setCurrentBranch(repoStatus.currentBranch);
        setRemotes(remoteList);
        setStaged(repoStatus.staged);
        setUnstaged(repoStatus.unstaged);
        setUntracked(repoStatus.untracked);
        setHistory(logs);
      } else {
        setRemotes([]);
        setStaged([]);
        setUnstaged([]);
        setUntracked([]);
        setHistory([]);
      }
    } catch (e) {
      console.warn('[GitContext] Refresh failed:', e);
    } finally {
      setIsLoading(false);
      endTimer();
    }
  }, [projectPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const initRepo = useCallback(async () => {
    if (!projectPath) return;
    await gitClient.init(projectPath);
    await refresh();
  }, [projectPath, refresh]);

  const stageFiles = useCallback(async (files: string[] = []) => {
    if (!projectPath) return;
    await gitClient.stage(projectPath, files);
    await refresh();
  }, [projectPath, refresh]);

  const unstageFiles = useCallback(async (files: string[] = []) => {
    if (!projectPath) return;
    await gitClient.unstage(projectPath, files);
    await refresh();
  }, [projectPath, refresh]);

  const commit = useCallback(async (message: string, stageAll: boolean = false) => {
    if (!projectPath) return '';
    const res = await gitClient.commit(projectPath, message, stageAll);
    await refresh();
    return res;
  }, [projectPath, refresh]);

  const push = useCallback(async (remote?: string, branch?: string, setUpstream?: boolean) => {
    if (!projectPath) return '';
    setIsPushing(true);
    try {
      const res = await gitClient.push(projectPath, remote, branch, setUpstream);
      showToast({
        title: 'Git Push 完了',
        message: `リモート (${remote || 'origin'}) へのプッシュが正常に完了しました。`,
        type: 'success',
      });
      await refresh();
      return res;
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      showToast({
        title: 'Git Push 失敗',
        message: `プッシュ中にエラーが発生しました: ${errMsg}`,
        type: 'error',
      });
      throw e;
    } finally {
      setIsPushing(false);
    }
  }, [projectPath, refresh, showToast]);

  const discardFile = useCallback(async (filePath: string) => {
    if (!projectPath) return;
    await gitClient.discard(projectPath, filePath);
    await refresh();
  }, [projectPath, refresh]);

  const getDiff = useCallback(async (filePath: string, isStaged: boolean = false): Promise<GitDiffResult> => {
    if (!projectPath) {
      return {
        filePath,
        originalContent: '',
        modifiedContent: '',
        diffText: '',
      };
    }
    return await gitClient.diffFile(projectPath, filePath, isStaged);
  }, [projectPath]);

  return (
    <GitContext.Provider
      value={{
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
        getDiff,
      }}
    >
      {children}
    </GitContext.Provider>
  );
};

export const useGit = (): GitContextType => {
  const context = useContext(GitContext);
  if (!context) {
    throw new Error('useGit must be used within a GitProvider');
  }
  return context;
};
