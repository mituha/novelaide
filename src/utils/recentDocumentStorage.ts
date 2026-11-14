/**
 * プロジェクトごとに最後に開いていた（または保存した）novel ドキュメントの永続化ユーティリティ
 */

export interface LastNovelInfo {
  path: string;
  relativePath: string;
  fileTitle: string;
  updatedAt: number;
}

const STORAGE_KEY_PREFIX = 'novelaide:last-novel:';

export const recentDocumentStorage = {
  getKey(projectPath: string): string {
    return `${STORAGE_KEY_PREFIX}${projectPath}`;
  },

  /**
   * プロジェクトの最後に扱った novel ドキュメント情報を保存
   */
  save(projectPath: string, info: Omit<LastNovelInfo, 'updatedAt'>): void {
    if (!projectPath || !info.path) return;
    try {
      const data: LastNovelInfo = {
        ...info,
        updatedAt: Date.now(),
      };
      localStorage.setItem(this.getKey(projectPath), JSON.stringify(data));
    } catch (e) {
      console.warn('[recentDocumentStorage] Failed to save last novel info:', e);
    }
  },

  /**
   * プロジェクトの最後に扱った novel ドキュメント情報を取得
   */
  get(projectPath: string): LastNovelInfo | null {
    if (!projectPath) return null;
    try {
      const raw = localStorage.getItem(this.getKey(projectPath));
      if (!raw) return null;
      return JSON.parse(raw) as LastNovelInfo;
    } catch {
      return null;
    }
  },

  /**
   * プロジェクトの最後に扱った novel ドキュメント情報を削除（ファイル削除・移動時など）
   */
  remove(projectPath: string): void {
    if (!projectPath) return;
    try {
      localStorage.removeItem(this.getKey(projectPath));
    } catch (e) {
      console.warn('[recentDocumentStorage] Failed to remove last novel info:', e);
    }
  },
};
