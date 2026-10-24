import React from 'react';
import { useDocument } from '../../../contexts/DocumentContext';
import { DocumentIcon } from '../../FileExplorer/DocumentIcon';
import { ExplorerSectionProps } from '../../../types/explorerPlugin';
import { X } from 'lucide-react';
import './OpenDocumentsSection.css';

export const OpenDocumentsSection: React.FC<ExplorerSectionProps> = () => {
  const { openDocuments, activePath, setActivePath, closeDocument } = useDocument();

  if (openDocuments.length === 0) {
    return <div className="open-docs-empty">開いているファイルはありません</div>;
  }

  return (
    <ul className="open-docs-section-list">
      {openDocuments.map((doc) => {
        const isActive = doc.path === activePath;
        return (
          <li
            key={doc.path}
            className={`open-docs-item ${isActive ? 'active' : ''}`}
            onClick={() => setActivePath(doc.path)}
            title={doc.path}
          >
            <DocumentIcon type={doc.documentType} isOpen={false} size={14} />
            <span className="open-docs-title">{doc.baseName}</span>
            {doc.isDirty && <span className="open-docs-dirty">●</span>}
            <button
              type="button"
              className="open-docs-close-btn"
              onClick={(e) => {
                e.stopPropagation();
                closeDocument(doc.path);
              }}
              title="閉じる"
            >
              <X size={11} />
            </button>
          </li>
        );
      })}
    </ul>
  );
};
