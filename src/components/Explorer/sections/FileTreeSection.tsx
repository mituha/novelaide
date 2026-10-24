import React from 'react';
import { ExplorerSectionProps } from '../../../types/explorerPlugin';
import { FileExplorer } from '../../FileExplorer/FileExplorer';
import { useDocument } from '../../../contexts/DocumentContext';

export const FileTreeSection: React.FC<ExplorerSectionProps> = ({ projectPath }) => {
  const { openDocument, activePath } = useDocument();

  return (
    <div style={{ width: '100%' }}>
      <FileExplorer
        projectPath={projectPath}
        onSelectFile={(file) => {
          if (!file.isDirectory) {
            openDocument(file.path);
          }
        }}
        selectedFilePath={activePath}
      />
    </div>
  );
};
