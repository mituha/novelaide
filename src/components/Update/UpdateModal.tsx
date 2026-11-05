import React, { useState } from 'react';
import { updateService, type UpdateInfo } from '../../services/updateService';
import { Download, RefreshCw, CheckCircle, AlertCircle, X } from 'lucide-react';
import './UpdateModal.css';

interface UpdateModalProps {
  updateInfo: UpdateInfo;
  isOpen: boolean;
  onClose: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({ updateInfo, isOpen, onClose }) => {
  const [status, setStatus] = useState<'idle' | 'downloading' | 'ready' | 'error'>('idle');
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStartUpdate = async () => {
    try {
      setStatus('downloading');
      setErrorMessage(null);

      await updateService.downloadAndInstall(updateInfo.rawUpdate, (downloaded, total) => {
        setDownloadedBytes(downloaded);
        setTotalBytes(total);
      });

      setStatus('ready');
    } catch (err: any) {
      console.error('[UpdateModal] Update failed:', err);
      setStatus('error');
      setErrorMessage(err?.message || 'アップデートのダウンロードまたは適用に失敗しました。');
    }
  };

  const handleRelaunch = async () => {
    try {
      await updateService.relaunch();
    } catch (err: any) {
      alert(`再起動に失敗しました: ${err?.message || err}`);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const percent = totalBytes && totalBytes > 0
    ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
    : null;

  return (
    <div className="update-modal-overlay">
      <div className="update-modal-container">
        <div className="update-modal-header">
          <h3>
            <Download size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            novelaide アップデート
          </h3>
          {status !== 'downloading' && (
            <button type="button" className="update-modal-close-btn" onClick={onClose}>
              <X size={16} />
            </button>
          )}
        </div>

        <div className="update-modal-body">
          {status === 'idle' && (
            <div className="update-status-idle">
              <div className="update-version-badge">
                <span className="current-version">v{updateInfo.currentVersion}</span>
                <span className="version-arrow">➔</span>
                <span className="new-version">v{updateInfo.version}</span>
              </div>
              <p className="update-prompt-text">
                新しいバージョンが利用可能です。アップデートをダウンロードして適用しますか？
              </p>
              {updateInfo.body && (
                <div className="update-release-notes">
                  <h4>更新内容:</h4>
                  <div className="release-notes-content">{updateInfo.body}</div>
                </div>
              )}
            </div>
          )}

          {status === 'downloading' && (
            <div className="update-status-downloading">
              <div className="downloading-spinner">
                <RefreshCw size={24} className="spin-icon" />
              </div>
              <p className="downloading-text">最新バージョンをダウンロード中...</p>
              <div className="update-progress-bar-container">
                <div
                  className={`update-progress-bar ${percent === null ? 'indeterminate' : ''}`}
                  style={{ width: percent !== null ? `${percent}%` : '100%' }}
                />
              </div>
              <div className="update-progress-info">
                <span>{formatBytes(downloadedBytes)}</span>
                {totalBytes && <span> / {formatBytes(totalBytes)} ({percent}%)</span>}
              </div>
              <p className="update-hint">※ ダウンロード中もエディターでの執筆はそのまま続けられます。</p>
            </div>
          )}

          {status === 'ready' && (
            <div className="update-status-ready">
              <CheckCircle size={36} color="var(--color-success, #4caf50)" />
              <h4>アップデートの準備が完了しました</h4>
              <p>最新バージョンを適用して再起動しますか？</p>
              <p className="update-hint">（「後で」を選択した場合、次回アプリ起動時に自動適用されます）</p>
            </div>
          )}

          {status === 'error' && (
            <div className="update-status-error">
              <AlertCircle size={36} color="var(--color-error, #f44336)" />
              <h4>アップデートに失敗しました</h4>
              <p className="error-text">{errorMessage}</p>
            </div>
          )}
        </div>

        <div className="update-modal-footer">
          {status === 'idle' && (
            <>
              <button type="button" className="update-btn cancel" onClick={onClose}>
                後で
              </button>
              <button type="button" className="update-btn primary" onClick={handleStartUpdate}>
                アップデートを開始
              </button>
            </>
          )}

          {status === 'ready' && (
            <>
              <button type="button" className="update-btn cancel" onClick={onClose}>
                後で
              </button>
              <button type="button" className="update-btn success" onClick={handleRelaunch}>
                今すぐ再起動
              </button>
            </>
          )}

          {status === 'error' && (
            <button type="button" className="update-btn primary" onClick={onClose}>
              閉じる
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
