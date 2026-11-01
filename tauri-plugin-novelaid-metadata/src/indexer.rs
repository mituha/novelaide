use crate::entities::{parse_entity_from_metadata, EntityStore};
use crate::models::{MetadataCache, NovelaidDocument, ProjectScanSummary};
use crate::ruby_dict::{extract_rubies_from_text, RubyDictionaryStore};
use std::time::Instant;

pub struct DocumentIndexer;

impl DocumentIndexer {
    /// 単一の NovelaidDocument を解析して各ストアへ反映
    pub fn index_document(
        doc: &NovelaidDocument,
        metadata_cache: &mut MetadataCache,
        entity_store: &mut EntityStore,
        ruby_store: &mut RubyDictionaryStore,
    ) {
        // 1. メタデータキャッシュ格納
        if doc.metadata.is_object() && !doc.metadata.as_object().unwrap().is_empty() {
            metadata_cache.insert(doc.path.clone(), doc.metadata.clone());

            // 2. エンティティ抽出
            if let Some(entity) = parse_entity_from_metadata(&doc.path, &doc.metadata) {
                entity_store.insert(entity);
            }
        }

        // 3. 本文 (content) からルビ抽出
        let rubies = extract_rubies_from_text(&doc.content, &doc.path);
        for (surf, ruby) in rubies {
            ruby_store.record_occurrence(&surf, &ruby, &doc.path);
        }
    }

    /// 複数の NovelaidDocument を一括解析（既存インデックスをリセットして全件インデックス）
    pub fn index_documents(
        project_path: &str,
        docs: &[NovelaidDocument],
        metadata_cache: &mut MetadataCache,
        entity_store: &mut EntityStore,
        ruby_store: &mut RubyDictionaryStore,
    ) -> ProjectScanSummary {
        let start_time = Instant::now();

        metadata_cache.clear();
        entity_store.clear();
        ruby_store.clear();

        for doc in docs {
            Self::index_document(doc, metadata_cache, entity_store, ruby_store);
        }

        let duration_ms = start_time.elapsed().as_millis() as u64;

        ProjectScanSummary {
            project_path: project_path.to_string(),
            total_files_scanned: docs.len(),
            total_entities: entity_store.get_all().len(),
            total_ruby_entries: ruby_store.build_entries().len(),
            duration_ms,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri_plugin_novelaid_fs::NovelaidDocumentType;

    #[test]
    fn test_indexer_with_documents() {
        let mut meta = MetadataCache::new();
        let mut entities = EntityStore::new();
        let mut rubies = RubyDictionaryStore::new();

        let doc1 = NovelaidDocument {
            path: "mock/01.md".to_string(),
            base_name: "01.md".to_string(),
            file_title: "01".to_string(),
            content: "少年は|魔剣《ソウルイーター》を抜いた。".to_string(),
            metadata: serde_json::json!({
                "title": "プロローグ",
                "tags": ["plot"]
            }),
            document_type: NovelaidDocumentType::Novel,
            mtime_ms: 1000,
        };

        let doc2 = NovelaidDocument {
            path: "mock/characters/chara.md".to_string(),
            base_name: "chara.md".to_string(),
            file_title: "chara".to_string(),
            content: "主人公の設定資料".to_string(),
            metadata: serde_json::json!({
                "name": "ソラ・アルスター",
                "tags": ["character", "主人公"],
                "role": "主人公",
                "series": "本編",
                "books": ["1巻", "2巻"]
            }),
            document_type: NovelaidDocumentType::Markdown,
            mtime_ms: 2000,
        };

        let doc3 = NovelaidDocument {
            path: "mock/places/royal_capital.md".to_string(),
            base_name: "royal_capital.md".to_string(),
            file_title: "royal_capital".to_string(),
            content: "王都ルクシアの設定資料".to_string(),
            metadata: serde_json::json!({
                "title": "王都ルクシア",
                "tag": "location",
                "series": "本編",
                "book": "1巻"
            }),
            document_type: NovelaidDocumentType::Markdown,
            mtime_ms: 3000,
        };

        let summary = DocumentIndexer::index_documents(
            "mock",
            &[doc1, doc2, doc3],
            &mut meta,
            &mut entities,
            &mut rubies,
        );

        assert_eq!(summary.total_files_scanned, 3);
        assert_eq!(summary.total_entities, 3);
        assert_eq!(summary.total_ruby_entries, 1);

        let characters = entities.get_by_category(&crate::models::EntityCategory::Character);
        assert_eq!(characters.len(), 1);
        assert_eq!(characters[0].name, "ソラ・アルスター");
        assert_eq!(characters[0].series, vec!["本編"]);
        assert_eq!(characters[0].books, vec!["1巻", "2巻"]);

        let locations = entities.get_by_category(&crate::models::EntityCategory::Location);
        assert_eq!(locations.len(), 1);
        assert_eq!(locations[0].name, "王都ルクシア");
        assert_eq!(locations[0].series, vec!["本編"]);
        assert_eq!(locations[0].books, vec!["1巻"]);

        let ruby_list = rubies.build_entries();
        assert_eq!(ruby_list[0].surface, "魔剣");
        assert_eq!(ruby_list[0].canonical_ruby, "ソウルイーター");
    }
}
