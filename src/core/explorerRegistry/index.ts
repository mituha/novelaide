import { ExplorerRegistry } from './ExplorerRegistry';
import { OpenDocumentsSection } from '../../components/Explorer/sections/OpenDocumentsSection';
import { FileTreeSection, FileTreeHeaderActions } from '../../components/Explorer/sections/FileTreeSection';
import { OutlineSection } from '../../components/Explorer/sections/OutlineSection';
import { Folder } from 'lucide-react';

export const explorerRegistry = new ExplorerRegistry();

// 1. 開いているドキュメント
explorerRegistry.register({
  id: 'novelaid.explorer.openDocs',
  title: '開いているドキュメント',
  defaultExpanded: true,
  priority: 100,
  component: OpenDocumentsSection,
});

// 2. 原稿ファイルツリー（プロジェクトフォルダー統合）
explorerRegistry.register({
  id: 'novelaid.explorer.fileTree',
  title: ({ projectPath }) => {
    if (!projectPath) return '作品フォルダー';
    const norm = projectPath.replace(/\\/g, '/');
    const parts = norm.split('/');
    return parts[parts.length - 1] || '作品フォルダー';
  },
  icon: Folder,
  defaultExpanded: true,
  priority: 90,
  headerActions: FileTreeHeaderActions,
  component: FileTreeSection,
});

// 3. 見出しアウトライン
explorerRegistry.register({
  id: 'novelaid.explorer.outline',
  title: '見出しアウトライン',
  defaultExpanded: true,
  priority: 80,
  component: OutlineSection,
});

export { ExplorerRegistry };
