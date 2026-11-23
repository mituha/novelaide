import React, { useState, useMemo, useCallback } from 'react';
import { ArrowRight, Play, FileCode } from 'lucide-react';
import { fileService } from '../../../services/fileService';
import { useDocument } from '../../../contexts/DocumentContext';
import { useNotification } from '../../../contexts/NotificationContext';
import { BatchFileItem } from '../../../types/batchTool';

interface BatchExtensionChangerProps {
  targetDir?: string;
  selectedFiles: BatchFileItem[];
  onExecutionComplete: () => void;
}

export const BatchExtensionChanger: React.FC<BatchExtensionChangerProps> = ({
  selectedFiles,
  onExecutionComplete,
}) => {
  const { updateDocumentPath, openDocuments, saveDocument } = useDocument();
  const { showToast, confirmDialog } = useNotification();

  const [fromExt, setFromExt] = useState<string>('md');
  const [toExt, setToExt] = useState<string>('txt');
  const [isExecuting, setIsExecuting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  // プリセット切り替え
  const handleApplyPreset = (from: string, to: string) => {
    setFromExt(from);
    setToExt(to);
  };

  // 変換対象ファイルのフィルタリングと変換後パスのプレビュー算出
  const previewItems = useMemo(() => {
    const cleanFrom = fromExt.trim().toLowerCase().replace(/^\./, '');
    const cleanTo = toExt.trim().toLowerCase().replace(/^\./, '');

    if (!cleanFrom || !cleanTo) return [];

    return selectedFiles
      .filter((file) => file.extension.toLowerCase() === cleanFrom)
      .map((file) => {
        const dir = fileService.dirname(file.path);
        const stem = fileService.stem(file.name);
        const newFileName = `${stem}.${cleanTo}`;
        const newPath = fileService.joinPath(dir, newFileName);
        const newRelativePath = file.relativePath.replace(
          new RegExp(`\\.${cleanFrom}$`, 'i'),
          `.${cleanTo}`
        );

        return {
          originalFile: file,
          newFileName,
          newPath,
          newRelativePath,
          // 既存ファイルとの衝突チェック（同一フォルダー内に同名ファイルがすでにあるか）
          isConflict: false,
        };
      });
  }, [selectedFiles, fromExt, toExt]);

  // 一括リネーム実行
  const handleExecute = useCallback(async () => {
    if (previewItems.length === 0) {
      showToast({ message: '変換対象のファイルが選択されていません', type: 'warning' });
      return;
    }

    const cleanFrom = fromExt.trim().toLowerCase().replace(/^\./, '');
    const cleanTo = toExt.trim().toLowerCase().replace(/^\./, '');

    if (cleanFrom === cleanTo) {
      showToast({ message: '変換前と変換後の拡張子が同じです', type: 'warning' });
      return;
    }

    const confirmed = await confirmDialog({
      title: '一括拡張子変更の確認',
      message: `選択された ${previewItems.length} 件のファイルを一括で .${cleanFrom} から .${cleanTo} に変更します。\n実行してもよろしいですか？`,
      kind: 'warning',
      okLabel: '変更を実行',
      cancelLabel: 'キャンセル',
    });

    if (!confirmed) {
      return;
    }

    setIsExecuting(true);
    setProgress({ current: 0, total: previewItems.length });

    let successCount = 0;
    let failCount = 0;
    const errors: { file: string; message: string }[] = [];

    // 変更前に対象の開いている未保存ドキュメントがあれば保存
    for (const item of previewItems) {
      const openDoc = openDocuments.find((d) => fileService.isSamePath(d.path, item.originalFile.path));
      if (openDoc?.isDirty) {
        try {
          await saveDocument(openDoc.path);
        } catch (e) {
          console.warn(`[BatchExtensionChanger] Failed to save dirty doc before rename: ${openDoc.path}`, e);
        }
      }
    }

    // 順次リネーム実行
    for (let i = 0; i < previewItems.length; i++) {
      const item = previewItems[i];
      setProgress({ current: i + 1, total: previewItems.length });

      try {
        await fileService.rename(item.originalFile.path, item.newPath);
        // 開いているタブがあればパスを同期更新
        updateDocumentPath(item.originalFile.path, item.newPath);
        successCount++;
      } catch (err: any) {
        console.error(`[BatchExtensionChanger] Rename error for ${item.originalFile.path}:`, err);
        failCount++;
        errors.push({
          file: item.originalFile.relativePath,
          message: String(err?.message || err),
        });
      }
    }

    setIsExecuting(false);
    setProgress(null);

    // プロジェクトツリーの再読み込みを通知
    window.dispatchEvent(new CustomEvent('novelaide:project-refresh-needed'));

    if (failCount === 0) {
      showToast({
        message: `${successCount} 件のファイル拡張子を .${cleanTo} に変更しました`,
        type: 'info',
        duration: 4000,
      });
    } else {
      showToast({
        message: `変更完了: ${successCount} 件成功, ${failCount} 件失敗`,
        type: 'warning',
        duration: 5000,
      });
    }

    onExecutionComplete();
  }, [previewItems, fromExt, toExt, openDocuments, saveDocument, updateDocumentPath, showToast, confirmDialog, onExecutionComplete]);

  return (
    <div className="batch-action-container">
      <div className="batch-action-header">
        <FileCode size={15} className="batch-icon" />
        <h3 className="batch-action-title">一括拡張子変更</h3>
      </div>

      <p className="batch-action-desc">
        選択フォルダー内のファイルの拡張子（.md ⇔ .txt など）を一括でリネームします。
      </p>

      {/* プリセットボタン */}
      <div className="batch-preset-row">
        <span className="batch-preset-label">クイックプリセット:</span>
        <button
          className="batch-btn-preset"
          onClick={() => handleApplyPreset('md', 'txt')}
        >
          .md → .txt
        </button>
        <button
          className="batch-btn-preset"
          onClick={() => handleApplyPreset('txt', 'md')}
        >
          .txt → .md
        </button>
      </div>

      {/* 変換設定入力 */}
      <div className="batch-config-form">
        <div className="batch-config-group">
          <label className="batch-config-label">変換前 拡張子:</label>
          <div className="batch-input-with-dot">
            <span className="batch-dot">.</span>
            <input
              type="text"
              className="batch-text-input"
              value={fromExt}
              onChange={(e) => setFromExt(e.target.value)}
              placeholder="md"
              disabled={isExecuting}
            />
          </div>
        </div>

        <ArrowRight size={16} className="batch-arrow-icon" />

        <div className="batch-config-group">
          <label className="batch-config-label">変換後 拡張子:</label>
          <div className="batch-input-with-dot">
            <span className="batch-dot">.</span>
            <input
              type="text"
              className="batch-text-input"
              value={toExt}
              onChange={(e) => setToExt(e.target.value)}
              placeholder="txt"
              disabled={isExecuting}
            />
          </div>
        </div>
      </div>

      {/* 変換プレビュー */}
      <div className="batch-preview-section">
        <div className="batch-preview-header">
          <span>変換プレビュー ({previewItems.length} 件対象)</span>
        </div>

        <div className="batch-preview-list">
          {previewItems.length === 0 ? (
            <div className="batch-preview-empty">
              .{fromExt} に一致する選択中ファイルはありません
            </div>
          ) : (
            previewItems.map((item) => (
              <div key={item.originalFile.path} className="batch-preview-item">
                <span className="batch-preview-orig" title={item.originalFile.relativePath}>
                  {item.originalFile.name}
                </span>
                <ArrowRight size={12} className="batch-preview-arrow" />
                <span className="batch-preview-new" title={item.newRelativePath}>
                  {item.newFileName}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 実行ボタン & 進捗 */}
      <div className="batch-exec-footer">
        {progress && (
          <div className="batch-progress-bar-wrap">
            <div
              className="batch-progress-bar"
              style={{
                width: `${(progress.current / progress.total) * 100}%`,
              }}
            />
            <span className="batch-progress-text">
              処理中: {progress.current} / {progress.total}
            </span>
          </div>
        )}

        <button
          className="batch-exec-btn"
          onClick={handleExecute}
          disabled={isExecuting || previewItems.length === 0}
        >
          <Play size={14} />
          <span>{isExecuting ? '変換中...' : `${previewItems.length} 件の拡張子を変更`}</span>
        </button>
      </div>
    </div>
  );
};
