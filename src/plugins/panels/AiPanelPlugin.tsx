import React from 'react';
import { PanelPlugin } from '../../types/panelPlugin';
import { Sparkles } from 'lucide-react';
import { AIChatPanel } from 'tauri-plugin-novelaid-ai-api';
import { useDocument } from '../../contexts/DocumentContext';
import { fileService } from '../../services/fileService';

const AiPanelWrapper: React.FC = () => {
  const { activeDocument, activeLeftItem, activeRightItem, openDocuments } = useDocument();

  return (
    <AIChatPanel
      activeLeftItem={
        activeLeftItem
          ? {
              path: activeLeftItem.path,
              baseName: activeLeftItem.fileTitle || activeLeftItem.baseName,
              content:
                openDocuments.find((d) => d.path === activeLeftItem.path)?.content || '',
            }
          : activeDocument
          ? {
              path: activeDocument.path,
              baseName: activeDocument.fileTitle || activeDocument.baseName,
              content: activeDocument.content,
            }
          : null
      }
      activeRightItem={
        activeRightItem
          ? {
              path: activeRightItem.path,
              baseName: activeRightItem.fileTitle || activeRightItem.baseName,
              content:
                openDocuments.find((d) => d.path === activeRightItem.path)?.content || '',
            }
          : null
      }
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
