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
 * ドキュメント表示モードの種類
 */
export type DocumentViewMode = 'none' | 'editor' | 'canvas' | 'reader' | 'preview';

/**
 * 開いているドキュメントの状態
 */
export interface DocumentState {
  path: string;
  baseName: string;
  fileTitle: string;
  content: string;
  metadata: Record<string, any>;
  documentType: NovelaidDocumentType;
  isDirty: boolean;

  /** 左ペインでの表示モード (通常 'editor') */
  leftViewMode: DocumentViewMode;
  /** 右ペインでの表示モード (通常 'none', 'preview', 'reader') */
  rightViewMode: DocumentViewMode;
}
