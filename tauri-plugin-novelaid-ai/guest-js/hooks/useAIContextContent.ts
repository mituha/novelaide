import { useCallback } from 'react';
import { useAIContext } from '../contexts/AIContextContext';

export interface ContextDocumentItem {
  path: string;
  baseName?: string;
  content: string;
}

export function useAIContextContent() {
  const { contextState } = useAIContext();

  const getContextText = useCallback(
    async (
      activeLeftItem: ContextDocumentItem | null,
      activeRightItem: ContextDocumentItem | null,
      openDocuments: ContextDocumentItem[],
      readFileDiskFn?: (path: string) => Promise<string>
    ): Promise<string> => {
      const paths = new Set<string>();

      // アクティブなドキュメント
      if (contextState.includeLeftActive && activeLeftItem) paths.add(activeLeftItem.path);
      if (contextState.includeRightActive && activeRightItem) paths.add(activeRightItem.path);

      // その他の開いているタブ
      if (contextState.includeAllOpen) {
        openDocuments.forEach((doc) => paths.add(doc.path));
      }

      // カスタムで追加されたファイル
      contextState.customPaths.forEach((p) => paths.add(p));

      let result = '';
      for (const path of paths) {
        // openDocuments から該当するドキュメントを探す（未保存最新バッファ優先）
        const doc = openDocuments.find((d) => d.path === path);

        let content = '';
        if (doc) {
          content = doc.content;
        } else if (readFileDiskFn) {
          try {
            content = await readFileDiskFn(path);
          } catch (e) {
            console.error(`Failed to read context file: ${path}`, e);
            continue;
          }
        }

        const fileName = path.split(/[/\\]/).pop() || path;
        if (content) {
          result += `[File: ${fileName}]\n\`\`\`\n${content}\n\`\`\`\n\n`;
        }
      }

      return result;
    },
    [contextState]
  );

  return { getContextText };
}
