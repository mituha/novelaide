import { invoke } from '@tauri-apps/api/core';
import type { GitRepoStatus, GitCommitLog, GitDiffResult } from './types';

export const gitClient = {
  isRepo: async (path: string): Promise<boolean> => {
    try {
      return await invoke<boolean>('plugin:restar-git|git_is_repo', { path });
    } catch {
      return true; // モック環境用
    }
  },

  init: async (path: string): Promise<void> => {
    return await invoke('plugin:restar-git|git_init', { path });
  },

  status: async (path: string): Promise<GitRepoStatus> => {
    try {
      return await invoke<GitRepoStatus>('plugin:restar-git|git_status', { path });
    } catch {
      // モックデータ（撮影・ブラウザ用フォールバック）
      return {
        isRepo: true,
        currentBranch: 'main',
        staged: [
          { path: '01_プロローグ.md', status: 'modified', isStaged: true },
        ],
        unstaged: [
          { path: '02_第一話.md', status: 'modified', isStaged: false },
          { path: 'settings/characters.md', status: 'modified', isStaged: false },
        ],
        untracked: [
          { path: 'plot/timeline.md', status: 'untracked', isStaged: false },
        ],
      };
    }
  },

  stage: async (path: string, files: string[] = []): Promise<void> => {
    return await invoke('plugin:restar-git|git_stage', { path, files });
  },

  unstage: async (path: string, files: string[] = []): Promise<void> => {
    return await invoke('plugin:restar-git|git_unstage', { path, files });
  },

  commit: async (path: string, message: string, stageAll: boolean = false): Promise<string> => {
    return await invoke<string>('plugin:restar-git|git_commit', {
      path,
      message,
      stageAll,
    });
  },

  log: async (path: string, maxCount: number = 50): Promise<GitCommitLog[]> => {
    try {
      return await invoke<GitCommitLog[]>('plugin:restar-git|git_log', {
        path,
        maxCount,
      });
    } catch {
      // モックデータ（撮影・ブラウザ用フォールバック）
      return [
        {
          hash: 'a1b2c3d4e5f67890123456789abcdef012345678',
          shortHash: 'a1b2c3d',
          authorName: '水樹 三葉',
          authorEmail: 'mizuki@example.com',
          date: new Date(Date.now() - 3600000 * 2).toISOString(),
          message: 'feat: 第1章 プロローグの加筆とキャラクター設定の更新',
          parents: ['b2c3d4e5f67890123456789abcdef0123456789a'],
        },
        {
          hash: 'b2c3d4e5f67890123456789abcdef0123456789a',
          shortHash: 'b2c3d4e',
          authorName: '水樹 三葉',
          authorEmail: 'mizuki@example.com',
          date: new Date(Date.now() - 86400000).toISOString(),
          message: 'feat: 小説プロジェクト初期構成の作成',
          parents: [],
        },
      ];
    }
  },

  diffFile: async (path: string, filePath: string, staged: boolean = false): Promise<GitDiffResult> => {
    try {
      return await invoke<GitDiffResult>('plugin:restar-git|git_diff_file', {
        path,
        filePath,
        staged,
      });
    } catch {
      return {
        filePath,
        originalContent: '――星が降る夜、二人の物語が始まった。\n',
        modifiedContent: '――星が青く瞬く静寂の夜、二人の運命の物語が始まった。\n神代玲央は空を見上げた。',
        diffText: '',
      };
    }
  },

  discard: async (path: string, filePath: string): Promise<void> => {
    return await invoke('plugin:restar-git|git_discard', { path, filePath });
  },

  getRemotes: async (path: string): Promise<string[]> => {
    try {
      return await invoke<string[]>('plugin:restar-git|git_get_remotes', { path });
    } catch {
      return ['origin']; // モック環境用
    }
  },

  push: async (
    path: string,
    remote?: string,
    branch?: string,
    setUpstream?: boolean
  ): Promise<string> => {
    return await invoke<string>('plugin:restar-git|git_push', {
      path,
      remote,
      branch,
      setUpstream,
    });
  },
};
