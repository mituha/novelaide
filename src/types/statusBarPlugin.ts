import React from 'react';
import { DocumentState } from './document';

/**
 * ステータスバーアイテムコンポーネントに渡されるプロパティ
 */
export interface StatusBarItemProps {
  activeDocument: DocumentState | null;
  selectedText?: string;
}

/**
 * ステータスバーアイテムプラグイン定義インターフェース
 */
export interface StatusBarItemPlugin {
  /** 一意なアイテムID (例: 'novelaid.status.charCount', 'novelaid.status.git') */
  readonly id: string;
  /** 配置先 ('left' | 'right') */
  readonly alignment: 'left' | 'right';
  /** 表示優先順位 (数値が大きいほど外側に配置) */
  readonly priority: number;
  /** 表示条件 (例: ドキュメントが開いている時のみ) */
  readonly isVisible?: (activeDocument: DocumentState | null) => boolean;
  /** アイテム本体コンポーネント */
  readonly component: React.ComponentType<StatusBarItemProps>;
}
