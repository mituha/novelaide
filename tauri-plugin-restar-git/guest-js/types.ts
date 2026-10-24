export interface GitFileStatus {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  isStaged: boolean;
}

export interface GitCommitLog {
  hash: string;
  shortHash: string;
  authorName: string;
  authorEmail: string;
  date: string; // ISO 8601
  message: string;
  parents: string[];
}

export interface GitRepoStatus {
  isRepo: boolean;
  currentBranch: string;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: GitFileStatus[];
}

export interface GitDiffResult {
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  diffText: string;
}
