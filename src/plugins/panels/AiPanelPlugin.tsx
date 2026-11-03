import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PanelPlugin } from '../../types/panelPlugin';
import { Sparkles } from 'lucide-react';
import { useProject } from '../../contexts/ProjectContext';
import { useDocument } from '../../contexts/DocumentContext';
import { fileService } from '../../services/fileService';
import { ChatView } from '../../components/Chat/ChatView';

const AiPanelWrapper: React.FC = () => {
  const { projectPath } = useProject();
  const { openDocument } = useDocument();

  const [chatContent, setChatContent] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const panelFilePath = projectPath ? fileService.joinPath(projectPath, '.novelaid/ai-chat.ch') : '';
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // プロジェクトの .novelaid/ai-chat.ch から読み込み
  useEffect(() => {
    let isMounted = true;

    async function loadPanelChat() {
      if (!panelFilePath) {
        setIsLoaded(true);
        return;
      }

      try {
        const fileDoc = await fileService.readFile(panelFilePath);
        if (isMounted) {
          setChatContent(fileDoc.content || '');
          setIsLoaded(true);
        }
      } catch {
        // ファイルがまだ存在しない場合は空
        if (isMounted) {
          setChatContent('');
          setIsLoaded(true);
        }
      }
    }

    loadPanelChat();

    return () => {
      isMounted = false;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [panelFilePath]);

  // パネルチャット内容の変更と自動保存
  const handleContentChange = useCallback(
    (newContent: string) => {
      setChatContent(newContent);

      if (!panelFilePath) return;

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // デバウンス保存 (500ms)
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await fileService.createFile(panelFilePath, newContent);
        } catch (e) {
          console.warn('[AiPanel] Failed to autosave panel chat:', e);
        }
      }, 500);
    },
    [panelFilePath]
  );

  // パネルでの相談内容を作品内の通常 .ch ファイルとしてエクスポート
  const handleExportToFile = useCallback(async () => {
    if (!projectPath || !chatContent) return;

    setIsExporting(true);
    try {
      const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
      const targetDir = fileService.joinPath(projectPath, 'chats');
      await fileService.createDirectory(targetDir).catch(() => {});

      const newFilePath = fileService.joinPath(targetDir, `chat_${timestamp}.ch`);
      await fileService.createFile(newFilePath, chatContent);

      // 作成されたチャットファイルをエディターで即座に開く
      await openDocument(newFilePath);
    } catch (err) {
      console.error('[AiPanel] Failed to export chat file:', err);
    } finally {
      setTimeout(() => setIsExporting(false), 1500);
    }
  }, [projectPath, chatContent, openDocument]);

  if (!isLoaded) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--text-secondary, #888)',
          fontSize: '12px',
        }}
      >
        <span>チャットを読み込み中...</span>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
      <ChatView
        content={chatContent}
        path={panelFilePath}
        baseName="AI執筆パートナー"
        onChangeContent={handleContentChange}
        showExportButton={!!projectPath}
        onExportToFile={handleExportToFile}
        isExporting={isExporting}
      />
    </div>
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
