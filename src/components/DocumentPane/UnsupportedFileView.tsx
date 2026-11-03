import React from 'react';
import { FileQuestion, FolderOpen } from 'lucide-react';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import './UnsupportedFileView.css';

interface UnsupportedFileViewProps {
  path: string;
  documentType: string;
  extension?: string;
}

export const UnsupportedFileView: React.FC<UnsupportedFileViewProps> = ({
  path,
  documentType,
  extension,
}) => {
  const fileName = path.split(/[/\\]/).pop() || path;
  const ext = (extension || (fileName.includes('.') ? fileName.split('.').pop() : 'UNKNOWN'))?.toUpperCase();

  const handleReveal = async () => {
    try {
      await revealItemInDir(path);
    } catch (e) {
      console.warn('revealItemInDir fallback:', e);
    }
  };

  return (
    <div className="unsupported-file-container">
      <div className="unsupported-file-card">
        <div className="unsupported-file-icon-wrapper">
          <FileQuestion size={48} className="unsupported-file-icon" />
          <span className="unsupported-file-ext-badge">{ext}</span>
        </div>

        <h3 className="unsupported-file-title">プレビューおよび編集に対応していません</h3>
        <p className="unsupported-file-message">
          このファイル形式（<code>.{ext?.toLowerCase()}</code>）は、<code>novelaide</code> のテキストエディターおよびプレビューで開くことができません。
        </p>

        <div className="unsupported-file-details">
          <div className="unsupported-detail-row">
            <span className="detail-label">ファイル名:</span>
            <span className="detail-value">{fileName}</span>
          </div>
          <div className="unsupported-detail-row">
            <span className="detail-label">パス:</span>
            <span className="detail-value path" title={path}>{path}</span>
          </div>
          <div className="unsupported-detail-row">
            <span className="detail-label">種別:</span>
            <span className="detail-value">{documentType}</span>
          </div>
        </div>

        <button
          type="button"
          className="unsupported-reveal-btn"
          onClick={handleReveal}
          title="OSのファイル管理（エクスプローラー）でこのファイルの場所を開きます"
        >
          <FolderOpen size={14} />
          <span>エクスプローラーで表示</span>
        </button>
      </div>
    </div>
  );
};
