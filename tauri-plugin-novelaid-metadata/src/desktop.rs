use crate::entities::EntityStore;
use crate::error::Result;
use crate::indexer::DocumentIndexer;
use crate::models::{
    CalibrationProjectContext, EntityCategory, MetadataCache, NovelaidDocument, ProjectEntity,
    ProjectRubyEntry, ProjectScanSummary,
};
use crate::ruby_dict::RubyDictionaryStore;
use serde_json::Value;
use std::path::Path;
use std::sync::Mutex;
use tauri::Runtime;
use tauri_plugin_novelaid_fs::NovelaidFsExt;

pub struct NovelaidMetadata<R: Runtime> {
    app: tauri::AppHandle<R>,
    metadata_cache: Mutex<MetadataCache>,
    entity_store: Mutex<EntityStore>,
    ruby_store: Mutex<RubyDictionaryStore>,
}

impl<R: Runtime> NovelaidMetadata<R> {
    pub fn new(app: tauri::AppHandle<R>) -> Self {
        Self {
            app,
            metadata_cache: Mutex::new(MetadataCache::new()),
            entity_store: Mutex::new(EntityStore::new()),
            ruby_store: Mutex::new(RubyDictionaryStore::new()),
        }
    }

    /// プロジェクトの全走査を実行（物理走査は novelaid-fs に委譲し、取得された NovelaidDocument をインデックス化）
    pub fn scan_project(&self, project_path: &str) -> Result<ProjectScanSummary> {
        let path = Path::new(project_path);
        let documents = self.app.novelaid_fs().scan_documents(path)?;

        let mut meta = self.metadata_cache.lock().unwrap();
        let mut entities = self.entity_store.lock().unwrap();
        let mut rubies = self.ruby_store.lock().unwrap();

        let summary = DocumentIndexer::index_documents(
            project_path,
            &documents,
            &mut meta,
            &mut entities,
            &mut rubies,
        );
        Ok(summary)
    }

    /// 渡された NovelaidDocument リストを一括インデックス化
    pub fn index_documents(&self, project_path: &str, documents: &[NovelaidDocument]) -> ProjectScanSummary {
        let mut meta = self.metadata_cache.lock().unwrap();
        let mut entities = self.entity_store.lock().unwrap();
        let mut rubies = self.ruby_store.lock().unwrap();

        DocumentIndexer::index_documents(
            project_path,
            documents,
            &mut meta,
            &mut entities,
            &mut rubies,
        )
    }

    /// 単一 NovelaidDocument の増分インデックス更新
    pub fn index_document(&self, document: &NovelaidDocument) {
        let mut meta = self.metadata_cache.lock().unwrap();
        let mut entities = self.entity_store.lock().unwrap();
        let mut rubies = self.ruby_store.lock().unwrap();

        DocumentIndexer::index_document(document, &mut meta, &mut entities, &mut rubies);
    }

    /// メタデータキャッシュの取得
    pub fn get_metadata_cache(&self) -> MetadataCache {
        self.metadata_cache.lock().unwrap().clone()
    }

    /// エンティティの取得
    pub fn get_entities(&self, category: Option<String>) -> Vec<ProjectEntity> {
        let store = self.entity_store.lock().unwrap();
        if let Some(cat_str) = category {
            let cat = match cat_str.to_lowercase().as_str() {
                "character" => EntityCategory::Character,
                "location" => EntityCategory::Location,
                "term" => EntityCategory::Term,
                "item" => EntityCategory::Item,
                _ => EntityCategory::Other,
            };
            store.get_by_category(&cat)
        } else {
            store.get_all()
        }
    }

    /// 作品固有ルビ辞書の取得
    pub fn get_ruby_dictionary(&self) -> Vec<ProjectRubyEntry> {
        self.ruby_store.lock().unwrap().build_entries()
    }

    /// 校正エンジン向け統合コンテキストの取得
    pub fn get_calibration_context(&self) -> CalibrationProjectContext {
        let entities = self.entity_store.lock().unwrap().get_all();
        let ruby_dictionary = self.ruby_store.lock().unwrap().build_entries();

        CalibrationProjectContext {
            entities,
            ruby_dictionary,
        }
    }

    /// 個別ファイルのメタデータ更新
    pub fn update_file_metadata(&self, path: &str, metadata: Value) -> Result<()> {
        let mut cache = self.metadata_cache.lock().unwrap();
        cache.insert(path.to_string(), metadata);
        Ok(())
    }
}
