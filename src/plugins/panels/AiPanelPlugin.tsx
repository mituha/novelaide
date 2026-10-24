import React from 'react';
import { PanelPlugin } from '../../types/panelPlugin';
import { Sparkles } from 'lucide-react';
import { AIChatPanel } from 'tauri-plugin-novelaid-ai-api';
import { useDocument } from '../../contexts/DocumentContext';
import { fileService } from '../../services/fileService';

const AiPanelWrapper: React.FC = () => {
  const { activeDocument, openDocuments } = useDocument();

  return (
    <AIChatPanel
      activeLeftItem={activeDocument ? {
        path: activeDocument.path,
        baseName: activeDocument.fileTitle || activeDocument.baseName,
        content: activeDocument.content,
      } : null}
      openDocuments={openDocuments.map((doc) => ({
        path: doc.path,
        baseName: doc.fileTitle || doc.baseName,
        content: doc.content,
      }))}
      readFileDiskFn={async (path) => {
        const fileDoc = await fileService.readFile(path);
        return fileDoc.content;
      }}
      getMetadataCacheFn={async () => {
        return await fileService.getMetadataCache();
      }}
    />
  );
};

export const AiPanelPlugin: PanelPlugin = {
  id: 'novelaid.panel.ai',
  title: 'AI執筆パートナー',
  icon: Sparkles,
  defaultPlacement: 'right',
  allowedPlacements: ['left', 'right'],
  scope: 'project',
  priority: 70,
  component: AiPanelWrapper,
};
