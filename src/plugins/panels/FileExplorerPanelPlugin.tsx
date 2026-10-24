import React from 'react';
import { PanelPlugin, PanelProps } from '../../types/panelPlugin';
import { Files } from 'lucide-react';
import { FileExplorer } from '../../components/FileExplorer/FileExplorer';
import { useDocument } from '../../contexts/DocumentContext';
import { useProject } from '../../contexts/ProjectContext';

const FileExplorerPanel: React.FC<PanelProps> = () => {
  const { openDocument, activePath } = useDocument();
  const { projectPath } = useProject();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
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

export const FileExplorerPanelPlugin: PanelPlugin = {
  id: 'novelaid.panel.files',
  title: 'ファイルエクスプローラー',
  icon: Files,
  defaultPlacement: 'left',
  allowedPlacements: ['left', 'right'],
  scope: 'project',
  priority: 100,
  component: FileExplorerPanel,
};
