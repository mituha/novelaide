import React from 'react';
import { DocumentState, DocumentViewMode, PaneId } from '../../types/document';
import { viewRegistry } from '../../core/viewRegistry';
import { useDocument } from '../../contexts/DocumentContext';
import { FileNameHeader } from '../Editor/FileNameHeader';
import { EpisodeNavigator } from '../Editor/EpisodeNavigator';
import { UnsupportedFileView } from './UnsupportedFileView';
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
  const { renameDocument } = useDocument();

  // レジストリからプラグインを動的に解決
  const plugin =
    document.documentType === 'unknown'
      ? undefined
      : viewRegistry.findPlugin(document.documentType, viewMode);

  const paneId: PaneId = paneSide === 'left' ? 'editor.left' : 'editor.right';

  if (!plugin) {
    return (
      <div className={`document-pane-container pane-${paneSide} view-mode-none`}>
        <FileNameHeader
          fileTitle={document.fileTitle}
          activePath={document.path}
          onRename={(newTitle) => renameDocument(document.path, newTitle)}
          isReadOnly={true}
        />
        <div className="document-pane-content">
          <UnsupportedFileView
            path={document.path}
            documentType={document.documentType}
            extension={document.extension}
          />
        </div>
      </div>
    );
  }

  const Component = plugin.component;

  return (
    <div
      className={`document-pane-container pane-${paneSide} view-mode-${viewMode}`}
    >
      <FileNameHeader
        fileTitle={document.fileTitle}
        activePath={document.path}
        onRename={(newTitle) => renameDocument(document.path, newTitle)}
        isReadOnly={viewMode !== 'editor'}
      />
      <div className="document-pane-content">
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
      <EpisodeNavigator
        activePath={document.path}
        documentType={document.documentType}
        paneId={paneId}
        viewMode={viewMode}
      />
    </div>
  );
};
