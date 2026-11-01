import { CalibrationProjectContext, NovelaidDocument, ProjectEntity, ProjectRubyEntry, ProjectScanSummary } from './models';
export * from './models';
/**
 * プロジェクト全体を走査し、Frontmatter・登場人物・世界設定・ルビ辞書を一括インデックス化します。
 * （物理走査はバックエンドの novelaid-fs に委譲されます）
 */
export declare function scanProject(projectPath: string): Promise<ProjectScanSummary>;
/**
 * 読み込まれた NovelaidDocument リストを一括で解析・インデックス化します。
 */
export declare function indexDocuments(projectPath: string, documents: NovelaidDocument[]): Promise<ProjectScanSummary>;
/**
 * 単一の NovelaidDocument を増分インデックス更新します。
 */
export declare function indexDocument(document: NovelaidDocument): Promise<void>;
/**
 * プロジェクト内の全ファイルのメタデータ（Frontmatter）キャッシュを取得します。
 */
export declare function getMetadataCache(): Promise<Record<string, any>>;
/**
 * プロジェクト内の登場人物・世界設定エンティティ一覧を取得します。
 * @param category オプションのカテゴリフィルタ（例: "character", "location", "term"）
 */
export declare function getEntities(category?: string): Promise<ProjectEntity[]>;
/**
 * プロジェクト内で使用されている作品固有ルビ辞書一覧を取得します。
 */
export declare function getRubyDictionary(): Promise<ProjectRubyEntry[]>;
/**
 * 校正エンジン（calibration）向けの統合プロジェクト知識コンテキストを取得します。
 */
export declare function getCalibrationContext(): Promise<CalibrationProjectContext>;
/**
 * 指定ファイルのメタデータ（Frontmatter）を更新します。
 */
export declare function updateFileMetadata(path: string, metadata: Record<string, any>): Promise<void>;
