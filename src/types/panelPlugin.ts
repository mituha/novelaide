import React from 'react';
import { DocumentState } from './document';

/**
 * サイドペイン内のパネルコンポーネントに渡される標準プロパティ
 */
export interface PanelProps {
  paneSide: 'left' | 'right';
  activeDocument: DocumentState | null;
  onClose?: () => void;
  onOpenLauncher?: () => void;
  onOpenFileDiff?: (filePath: string, staged: boolean) => void;
}

/**
 * パネルプラグイン定義インターフェース
 */
export interface PanelPlugin {
  /** 一意なパネルID (例: 'novelaid.panel.files', 'novelaid.panel.outline') */
  readonly id: string;
  /** 表示名 (ツールチップやヘッダータイトル) */
  readonly title: string;
  /** アクティビティバーに表示するアイコン */
  readonly icon: React.ComponentType<{ size?: number; className?: string }>;
  /** デフォルトの配置先 ('left' | 'right') */
  readonly defaultPlacement: 'left' | 'right';
  /** 配置可能なペイン ('left' | 'right' の両方、または一方) */
  readonly allowedPlacements?: ('left' | 'right')[];
  /** スコープ（'project': プロジェクト全体 / 'document': 開いている原稿個別） */
  readonly scope: 'project' | 'document';
  /** アイコン横のバッジ表示 (例: 校正エラー件数、Git変更件数など) */
  readonly badge?: () => number | string | null;
  /** 表示優先順位 (アクティビティバーでの並び順) */
  readonly priority?: number;
  /** パネル本体コンポーネント */
  readonly component: React.ComponentType<PanelProps>;
}
