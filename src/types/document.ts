import type {
  NovelaidDirEntry,
  NovelaidDocument,
  NovelaidDocumentType,
} from "tauri-plugin-novelaid-fs-api";

// Tauriプラグイン側のRust型定義（ts-rsによって自動生成された型）をベースにエクスポート
export type DocumentType = NovelaidDocumentType | "directory" | "metadata";
export type DirEntry = NovelaidDirEntry;
export type FileDocument = NovelaidDocument;

export type { NovelaidDirEntry, NovelaidDocument, NovelaidDocumentType };

/**
 * ペインの識別子
 * 将来的な多分割（3分割・縦分割）にも拡張可能な文字列ID
 */
export type PaneId = 'editor.left' | 'editor.right';

/**
 * ドキュメント表示モードの種類
 */
export type DocumentViewMode = 'none' | 'editor' | 'canvas' | 'reader' | 'preview';

/**
 * View 参照情報（どのViewに、どの表示モードで表示されているか）
 */
export interface DocumentViewRef {
  /** Viewの識別ID (例: 'editor.left', 'editor.right', 'panel.outline', 'context') */
  viewId: string;
  /** 当該Viewにおける表示モード (省略またはnullの場合はViewModeを持たない参照) */
  viewMode?: DocumentViewMode | null;
}

/**
 * 開いているドキュメントの状態（単一の実体）
 */
export interface DocumentState {
  path: string;
  baseName: string;
  fileTitle: string;
  /** 原稿本文の単一実体（左右ペイン間で完全共有） */
  content: string;
  /** Frontmatter設定等のメタデータ実体 */
  metadata: Record<string, any>;
  documentType: NovelaidDocumentType;
  isDirty: boolean;
  /** ファイルシステムの最終更新日時（Unixミリ秒） */
  mtime?: number;
  /** 前回保存時の文字数（大幅激減検知用） */
  lastSavedLength?: number;

  /** 現在このドキュメントを参照・表示している View 一覧（参照カウント式） */
  views: DocumentViewRef[];

  /** 後方互換用プロパティ（views から算出可能） */
  leftViewMode?: DocumentViewMode;
  rightViewMode?: DocumentViewMode;
}
