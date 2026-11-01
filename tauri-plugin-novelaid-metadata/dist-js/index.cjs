'use strict';

var core = require('@tauri-apps/api/core');

/**
 * プロジェクト全体を走査し、Frontmatter・登場人物・世界設定・ルビ辞書を一括インデックス化します。
 * （物理走査はバックエンドの novelaid-fs に委譲されます）
 */
async function scanProject(projectPath) {
    return await core.invoke('plugin:novelaid-metadata|scan_project', {
        projectPath,
    });
}
/**
 * 読み込まれた NovelaidDocument リストを一括で解析・インデックス化します。
 */
async function indexDocuments(projectPath, documents) {
    return await core.invoke('plugin:novelaid-metadata|index_documents', {
        projectPath,
        documents,
    });
}
/**
 * 単一の NovelaidDocument を増分インデックス更新します。
 */
async function indexDocument(document) {
    await core.invoke('plugin:novelaid-metadata|index_document', {
        document,
    });
}
/**
 * プロジェクト内の全ファイルのメタデータ（Frontmatter）キャッシュを取得します。
 */
async function getMetadataCache() {
    return await core.invoke('plugin:novelaid-metadata|get_metadata_cache');
}
/**
 * プロジェクト内の登場人物・世界設定エンティティ一覧を取得します。
 * @param category オプションのカテゴリフィルタ（例: "character", "location", "term"）
 */
async function getEntities(category) {
    return await core.invoke('plugin:novelaid-metadata|get_entities', {
        category,
    });
}
/**
 * プロジェクト内で使用されている作品固有ルビ辞書一覧を取得します。
 */
async function getRubyDictionary() {
    return await core.invoke('plugin:novelaid-metadata|get_ruby_dictionary');
}
/**
 * 校正エンジン（calibration）向けの統合プロジェクト知識コンテキストを取得します。
 */
async function getCalibrationContext() {
    return await core.invoke('plugin:novelaid-metadata|get_calibration_context');
}
/**
 * 指定ファイルのメタデータ（Frontmatter）を更新します。
 */
async function updateFileMetadata(path, metadata) {
    await core.invoke('plugin:novelaid-metadata|update_file_metadata', {
        path,
        metadata,
    });
}

exports.getCalibrationContext = getCalibrationContext;
exports.getEntities = getEntities;
exports.getMetadataCache = getMetadataCache;
exports.getRubyDictionary = getRubyDictionary;
exports.indexDocument = indexDocument;
exports.indexDocuments = indexDocuments;
exports.scanProject = scanProject;
exports.updateFileMetadata = updateFileMetadata;
