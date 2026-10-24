import React from 'react';
import { useDocument } from '../../contexts/DocumentContext';
import { DocumentIcon } from '../FileExplorer/DocumentIcon';
import { X } from 'lucide-react';
import './EditorTabs.css';

export const EditorTabs: React.FC = () => {
  const { openDocuments, activePath, setActivePath, closeDocument } = useDocument();

  if (openDocuments.length === 0) {
    return null;
  }

  return (
    <div className="editor-tabs-bar">
      <div className="editor-tabs-list">
        {openDocuments.map((doc) => {
          const isActive = doc.path === activePath;
          return (
            <div
              key={doc.path}
              className={`editor-tab-item ${isActive ? 'active' : ''}`}
              onClick={() => setActivePath(doc.path)}
              title={doc.path}
            >
              <DocumentIcon
                type={doc.documentType}
                isOpen={false}
                size={14}
              />
              <span className="tab-title">{doc.baseName}</span>
              {doc.isDirty ? (
                <span className="dirty-indicator" title="未保存の変更あり">
                  ●
                </span>
              ) : null}
              <button
                className="tab-close-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  closeDocument(doc.path);
                }}
                title="閉じる"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
