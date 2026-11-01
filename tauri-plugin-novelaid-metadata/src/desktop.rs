use crate::entities::EntityStore;
use crate::error::Result;
use crate::frontmatter::{extract_frontmatter_static, format_frontmatter_static};
use crate::models::{
    CalibrationProjectContext, DocumentContentWithMetadata, EntityCategory, MetadataCache,
    ProjectEntity, ProjectRubyEntry, ProjectScanSummary,
};
use crate::ruby_dict::RubyDictionaryStore;
use crate::scanner::scan_project_directory;
use serde_json::Value;
use std::sync::Mutex;
use tauri::Runtime;

pub struct NovelaidMetadata<R: Runtime> {
    _app: tauri::AppHandle<R>,
    metadata_cache: Mutex<MetadataCache>,
    entity_store: Mutex<EntityStore>,
    ruby_store: Mutex<RubyDictionaryStore>,
}

impl<R: Runtime> NovelaidMetadata<R> {
    pub fn new(app: tauri::AppHandle<R>) -> Self {
        Self {
            _app: app,
            metadata_cache: Mutex::new(MetadataCache::new()),
            entity_store: Mutex::new(EntityStore::new()),
            ruby_store: Mutex::new(RubyDictionaryStore::new()),
        }
    }

    /// プロジェクトの全走査を実行
    pub fn scan_project(&self, project_path: &str) -> Result<ProjectScanSummary> {
        let mut meta = self.metadata_cache.lock().unwrap();
        let mut entities = self.entity_store.lock().unwrap();
        let mut rubies = self.ruby_store.lock().unwrap();

        let summary = scan_project_directory(project_path, &mut meta, &mut entities, &mut rubies)?;
        Ok(summary)
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

    /// 本文から Frontmatter を抽出
    pub fn extract_frontmatter(&self, content: &str) -> DocumentContentWithMetadata {
        let (metadata, body) = extract_frontmatter_static(content);
        DocumentContentWithMetadata {
            metadata,
            content: body.to_string(),
        }
    }

    /// 本文とメタデータを再結合
    pub fn format_frontmatter(&self, metadata: &Value, content: &str) -> String {
        format_frontmatter_static(metadata, content)
    }
}
