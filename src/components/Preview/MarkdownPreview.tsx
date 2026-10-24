import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DocumentViewProps } from '../../types/viewPlugin';
import { FileText } from 'lucide-react';
import './MarkdownPreview.css';

export const MarkdownPreview: React.FC<DocumentViewProps> = ({ content }) => {
  return (
    <div className="markdown-preview-wrapper">
      <div className="markdown-preview-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <FileText size={14} />
          <span>Markdown プレビュー</span>
        </div>
      </div>
      <div className="markdown-preview-scroll-container">
        <div className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content || '*内容がありません*'}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
};
