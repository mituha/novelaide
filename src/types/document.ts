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
