import { normalizePath, getRelativePath } from '../services/fileService';

/**
 * プロジェクトごとに最後に開いていた（または保存した）novel ドキュメントの永続化ユーティリティ
 * 常にプロジェクトルートからの「相対パス」を基準にして永続化を行う
 */

export interface LastNovelInfo {
  relativePath: string;
  fileTitle: string;
  updatedAt: number;
  /** 後方互換性用（旧データ参照用） */
  path?: string;
}

const STORAGE_KEY_PREFIX = 'novelaide:last-novel:';

export const recentDocumentStorage = {
  getKey(projectPath: string): string {
    const normalized = normalizePath(projectPath).replace(/[\/\\]+$/, '').toLowerCase();
    return `${STORAGE_KEY_PREFIX}${normalized}`;
  },

  /**
   * プロジェクトの最後に扱った novel ドキュメント情報を保存（相対パスを保証）
   */
  save(
    projectPath: string,
    info: { relativePath?: string; path?: string; fileTitle: string }
  ): void {
    if (!projectPath) return;

    // 相対パスの確定（渡された relativePath または path から算出）
    let relPath = info.relativePath;
    if (!relPath && info.path) {
      relPath = getRelativePath(projectPath, info.path);
    } else if (relPath && /^[a-zA-Z]:[\\/]|^[\\/]{2}|^\//.test(relPath)) {
      // relativePath に絶対パスが渡されていた場合の正規化
      relPath = getRelativePath(projectPath, relPath);
    }

    if (!relPath) return;

    try {
      const data: LastNovelInfo = {
        relativePath: relPath.replace(/\\/g, '/'), // 保存時はスラッシュ区切りに統一
        fileTitle: info.fileTitle,
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
      const parsed = JSON.parse(raw);
      // 後方互換：古いデータで path しかない場合、projectPath からの相対パスを導出
      if (!parsed.relativePath && parsed.path) {
        parsed.relativePath = getRelativePath(projectPath, parsed.path).replace(/\\/g, '/');
      }
      return parsed as LastNovelInfo;
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
