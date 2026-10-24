import React, { useCallback } from 'react';
import { NovelaidMarkdown } from 'novelaid-markdown';
import { DocumentViewProps } from '../../types/viewPlugin';
import { useDocument } from '../../contexts/DocumentContext';
import { FileText } from 'lucide-react';
import 'novelaid-markdown/index.css';
import './MarkdownPreview.css';

export const MarkdownPreview: React.FC<DocumentViewProps> = ({ content, path }) => {
  const { openDocument } = useDocument();

  // Markdown内リンククリック時のハンドラ
  const handleLinkClick = useCallback(
    async (url: string) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        window.open(url, '_blank');
      } else if (path) {
        let decodedUrl = url;
        try {
          decodedUrl = decodeURIComponent(url);
        } catch (e) {
          // デコード失敗時はそのまま
        }

        const isAbsolute = decodedUrl.startsWith('/') || /^[a-zA-Z]:/.test(decodedUrl);
        let resolvedPath = decodedUrl;

        if (!isAbsolute) {
          // 相対パスの解決
          const dir = path.replace(/[\\/][^\\/]+$/, '');
          const separator = path.includes('\\') ? '\\' : '/';
          resolvedPath = `${dir}${separator}${decodedUrl}`.replace(/[\\/]+/g, separator);
        }

        try {
          await openDocument(resolvedPath);
        } catch (err) {
          console.error('Failed to open linked document:', err);
        }
      }
    },
    [path, openDocument]
  );

  return (
    <div className="markdown-preview-wrapper">
      <div className="markdown-preview-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <FileText size={14} />
          <span>Markdown 拡張プレビュー (novelaid-markdown)</span>
        </div>
      </div>
      <div className="markdown-preview-scroll-container">
        <div className="markdown-body">
          <NovelaidMarkdown
            content={content || '*内容がありません*'}
            filePath={path}
            className="novelaid-markdown-root"
            onLinkClick={handleLinkClick}
          />
        </div>
      </div>
    </div>
  );
};
