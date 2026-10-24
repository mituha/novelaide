import React from 'react';
import { DocumentState, DocumentViewMode } from '../../types/document';
import { viewRegistry } from '../../core/viewRegistry';
import './DocumentPane.css';

interface DocumentPaneProps {
  document: DocumentState;
  viewMode: DocumentViewMode;
  paneSide: 'left' | 'right';
  onChangeContent: (content: string) => void;
}

export const DocumentPane: React.FC<DocumentPaneProps> = ({
  document,
  viewMode,
  paneSide,
  onChangeContent,
}) => {
  // レジストリからプラグインを動的に解決
  const plugin = viewRegistry.findPlugin(document.documentType, viewMode);

  if (!plugin) {
    return (
      <div className="document-pane-empty">
        <p>
          「{document.documentType}」形式の「{viewMode}」表示に対応するプラグインが見つかりません。
        </p>
      </div>
    );
  }

  const Component = plugin.component;

  return (
    <div
      className={`document-pane-container pane-${paneSide} view-mode-${viewMode}`}
    >
      <Component
        path={document.path}
        content={document.content}
        documentType={document.documentType}
        isReadOnly={viewMode !== 'editor'}
        onChangeContent={onChangeContent}
        paneSide={paneSide}
        metadata={document.metadata}
      />
    </div>
  );
};
