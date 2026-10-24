import React from 'react';
import { DocumentState } from './document';

/**
 * エクスプローラーセクションコンポーネントに渡される標準プロパティ
 */
export interface ExplorerSectionProps {
  activeDocument: DocumentState | null;
  projectPath: string | null;
}

/**
 * エクスプローラーセクションプラグイン定義インターフェース
 */
export interface ExplorerSectionPlugin {
  /** 一意なセクションID (例: 'novelaid.explorer.openDocs', 'novelaid.explorer.fileTree') */
  readonly id: string;
  /** セクションヘッダータイトル */
  readonly title: string;
  /** 初期開閉状態 (true: 展開 / false: 折りたたみ、デフォルト: true) */
  readonly defaultExpanded?: boolean;
  /** 表示優先順位 (数値が大きいほど上部に配置) */
  readonly priority: number;
  /** ヘッダー右端のクイックアクション (任意) */
  readonly headerActions?: React.ComponentType<{ sectionId: string }>;
  /** ヘッダー右端のバッジ表示 (任意) */
  readonly badge?: () => number | string | null;
  /** セクション本体コンポーネント */
  readonly component: React.ComponentType<ExplorerSectionProps>;
}
