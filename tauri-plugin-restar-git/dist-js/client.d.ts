import type { GitRepoStatus, GitCommitLog, GitDiffResult } from './types';
export declare const gitClient: {
    isRepo: (path: string) => Promise<boolean>;
    init: (path: string) => Promise<void>;
    status: (path: string) => Promise<GitRepoStatus>;
    stage: (path: string, files?: string[]) => Promise<void>;
    unstage: (path: string, files?: string[]) => Promise<void>;
    commit: (path: string, message: string, stageAll?: boolean) => Promise<string>;
    log: (path: string, maxCount?: number) => Promise<GitCommitLog[]>;
    diffFile: (path: string, filePath: string, staged?: boolean) => Promise<GitDiffResult>;
    discard: (path: string, filePath: string) => Promise<void>;
};
