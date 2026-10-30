import React, { Suspense, lazy } from 'react';
import { PanelPlugin } from '../../types/panelPlugin';
import { Sparkles, Loader2 } from 'lucide-react';
import { useDocument } from '../../contexts/DocumentContext';
import { fileService } from '../../services/fileService';

// AI チャットコンポーネント（および 8MB の pi-coding-agent 仮想環境）をオンデマンドで遅延ロード
const LazyAIChatBundle = lazy(async () => {
  // スタイルの非同期読み込み
  await import('tauri-plugin-novelaid-ai-api/styles.css');
  const mod = await import('tauri-plugin-novelaid-ai-api');
  return {
    default: (props: any) => (
      <mod.AIContextProvider>
        <mod.AIChatPanel {...props} />
      </mod.AIContextProvider>
    ),
  };
});

const AiPanelWrapper: React.FC = () => {
  const { activeDocument, activeLeftItem, activeRightItem, openDocuments } = useDocument();

  return (
    <Suspense
      fallback={
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-secondary, #888)',
            gap: '10px',
            fontSize: '12px',
          }}
        >
          <Loader2
            size={22}
            style={{
              animation: 'spin 1s linear infinite',
              color: 'var(--accent-color, #3b82f6)',
            }}
          />
          <span>AI執筆パートナーを起動中...</span>
        </div>
      }
    >
      <LazyAIChatBundle
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
        readFileDiskFn={async (path: string) => {
          const fileDoc = await fileService.readFile(path);
          return fileDoc.content;
        }}
        getMetadataCacheFn={async () => {
          return await fileService.getMetadataCache();
        }}
      />
    </Suspense>
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
