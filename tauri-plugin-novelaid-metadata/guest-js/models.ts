/**
 * プロジェクト内エンティティの分類カテゴリ
 */
export type EntityCategory = 'character' | 'location' | 'term' | 'item' | 'other';

/**
 * 登場人物・世界設定エンティティ
 */
export interface ProjectEntity {
  /** 固有識別子（ファイル名または自動生成ID） */
  id: string;
  /** 正式名称・表示名（例: "ソラ・アルスター"） */
  name: string;
  /** 読み仮名（例: "そら あるすたー"） */
  reading?: string;
  /** 別名・略称・愛称（例: ["ソラ", "アルスター", "ソラくん"]） */
  aliases: string[];
  /** 分類カテゴリ */
  category: EntityCategory;
  /** 役割・属性（例: "主人公", "帝都", "古代魔法"） */
  role?: string;
  /** 概要メモ */
  summary?: string;
  /** 定義元ファイルパス */
  sourcePath?: string;
  /** 本文内での出現回数 */
  occurrenceCount: number;
}

/**
 * ルビ出現詳細
 */
export interface RubyOccurrence {
  /** 振られたルビ文字列 */
  ruby: string;
  /** 出現回数 */
  count: number;
  /** 初出ファイルパス */
  firstSeenPath: string;
}

/**
 * 作品固有ルビ辞書エントリ
 */
export interface ProjectRubyEntry {
  /** 親文字（例: "魔剣"） */
  surface: string;
  /** 代表ルビ（例: "ソウルイーター"） */
  canonicalRuby: string;
  /** 出現したすべてのルビバリエーション */
  variants: RubyOccurrence[];
  /** 表記揺れ（複数のルビが存在する）フラグ */
  hasConflict: boolean;
}

/**
 * 校正エンジンに渡すプロジェクト知識コンテキスト
 */
export interface CalibrationProjectContext {
  /** プロジェクト全エンティティ一覧 */
  entities: ProjectEntity[];
  /** 作品固有ルビ辞書一覧 */
  rubyDictionary: ProjectRubyEntry[];
}

/**
 * プロジェクト走査サマリー
 */
export interface ProjectScanSummary {
  projectPath: string;
  totalFilesScanned: number;
  totalEntities: number;
  totalRubyEntries: number;
  durationMs: number;
}

/**
 * Novelaidドキュメント構造（novelaid-fs 準拠）
 */
export interface NovelaidDocument {
  path: string;
  baseName: string;
  fileTitle: string;
  content: string;
  metadata: Record<string, any>;
  documentType: string;
  mtimeMs: number;
}
