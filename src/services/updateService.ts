import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
  rawUpdate: Update;
}

export type DownloadProgressCallback = (downloadedBytes: number, totalBytes: number | null) => void;

class UpdateService {
  private activeUpdate: Update | null = null;
  private isChecking: boolean = false;
  private isDownloading: boolean = false;

  /**
   * 更新の有無を確認する
   * @param silent true の場合、ネットワーク未接続などのエラー時に例外を投げずに null を返します
   */
  async checkForUpdate(silent: boolean = false): Promise<UpdateInfo | null> {
    if (this.isChecking) {
      return null;
    }

    this.isChecking = true;
    try {
      const update = await check();
      if (!update) {
        this.activeUpdate = null;
        return null;
      }

      this.activeUpdate = update;
      return {
        version: update.version,
        currentVersion: update.currentVersion,
        date: update.date,
        body: update.body,
        rawUpdate: update,
      };
    } catch (error) {
      if (silent) {
        console.warn('[UpdateService] Silent update check failed:', error);
        return null;
      }
      console.error('[UpdateService] Update check failed:', error);
      throw error;
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * 現在保持している、または指定された更新をダウンロードしてインストールする
   */
  async downloadAndInstall(
    update?: Update | null,
    onProgress?: DownloadProgressCallback
  ): Promise<void> {
    const targetUpdate = update || this.activeUpdate;
    if (!targetUpdate) {
      throw new Error('インストール対象のアップデートが存在しません。');
    }

    if (this.isDownloading) {
      throw new Error('すでにアップデートのダウンロードが進行中です。');
    }

    this.isDownloading = true;
    let downloaded = 0;
    let totalLength: number | null = null;

    try {
      await targetUpdate.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            totalLength = event.data.contentLength ?? null;
            downloaded = 0;
            if (onProgress) onProgress(downloaded, totalLength);
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (onProgress) onProgress(downloaded, totalLength);
            break;
          case 'Finished':
            if (onProgress) onProgress(downloaded, totalLength);
            break;
        }
      });
    } finally {
      this.isDownloading = false;
    }
  }

  /**
   * アプリケーションを再起動して最新バージョンを適用する
   */
  async relaunch(): Promise<void> {
    try {
      await relaunch();
    } catch (error) {
      console.error('[UpdateService] Failed to relaunch app:', error);
      throw error;
    }
  }
}

export const updateService = new UpdateService();
