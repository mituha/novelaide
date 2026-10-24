import { ExplorerRegistry } from './ExplorerRegistry';
import { OpenDocumentsSection } from '../../components/Explorer/sections/OpenDocumentsSection';
import { FileTreeSection } from '../../components/Explorer/sections/FileTreeSection';
import { OutlineSection } from '../../components/Explorer/sections/OutlineSection';

export const explorerRegistry = new ExplorerRegistry();

// 1. 開いているドキュメント
explorerRegistry.register({
  id: 'novelaid.explorer.openDocs',
  title: '開いているドキュメント',
  defaultExpanded: true,
  priority: 100,
  component: OpenDocumentsSection,
});

// 2. 原稿ファイルツリー
explorerRegistry.register({
  id: 'novelaid.explorer.fileTree',
  title: '原稿ファイル',
  defaultExpanded: true,
  priority: 90,
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
