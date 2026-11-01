import { invoke } from '@tauri-apps/api/core';
import {
  CalibrationProjectContext,
  NovelaidDocument,
  ProjectEntity,
  ProjectRubyEntry,
  ProjectScanSummary,
} from './models';

export * from './models';

/**
 * プロジェクト全体を走査し、Frontmatter・登場人物・世界設定・ルビ辞書を一括インデックス化します。
 * （物理走査はバックエンドの novelaid-fs に委譲されます）
 */
export async function scanProject(projectPath: string): Promise<ProjectScanSummary> {
  return await invoke<ProjectScanSummary>('plugin:novelaid-metadata|scan_project', {
    projectPath,
  });
}

/**
 * 読み込まれた NovelaidDocument リストを一括で解析・インデックス化します。
 */
export async function indexDocuments(
  projectPath: string,
  documents: NovelaidDocument[]
): Promise<ProjectScanSummary> {
  return await invoke<ProjectScanSummary>('plugin:novelaid-metadata|index_documents', {
    projectPath,
    documents,
  });
}

/**
 * 単一の NovelaidDocument を増分インデックス更新します。
 */
export async function indexDocument(document: NovelaidDocument): Promise<void> {
  await invoke('plugin:novelaid-metadata|index_document', {
    document,
  });
}

/**
 * プロジェクト内の全ファイルのメタデータ（Frontmatter）キャッシュを取得します。
 */
export async function getMetadataCache(): Promise<Record<string, any>> {
  return await invoke<Record<string, any>>('plugin:novelaid-metadata|get_metadata_cache');
}

/**
 * プロジェクト内の登場人物・世界設定エンティティ一覧を取得します。
 * @param category オプションのカテゴリフィルタ（例: "character", "location", "term"）
 */
export async function getEntities(category?: string): Promise<ProjectEntity[]> {
  return await invoke<ProjectEntity[]>('plugin:novelaid-metadata|get_entities', {
    category,
  });
}

/**
 * プロジェクト内で使用されている作品固有ルビ辞書一覧を取得します。
 */
export async function getRubyDictionary(): Promise<ProjectRubyEntry[]> {
  return await invoke<ProjectRubyEntry[]>('plugin:novelaid-metadata|get_ruby_dictionary');
}

/**
 * 校正エンジン（calibration）向けの統合プロジェクト知識コンテキストを取得します。
 */
export async function getCalibrationContext(): Promise<CalibrationProjectContext> {
  return await invoke<CalibrationProjectContext>('plugin:novelaid-metadata|get_calibration_context');
}

/**
 * 指定ファイルのメタデータ（Frontmatter）を更新します。
 */
export async function updateFileMetadata(
  path: string,
  metadata: Record<string, any>
): Promise<void> {
  await invoke('plugin:novelaid-metadata|update_file_metadata', {
    path,
    metadata,
  });
}
