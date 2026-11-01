use crate::entities::{parse_entity_from_metadata, EntityStore};
use crate::frontmatter::extract_frontmatter_static;
use crate::models::{MetadataCache, ProjectScanSummary};
use crate::ruby_dict::{extract_rubies_from_text, RubyDictionaryStore};
use std::fs;
use std::path::Path;
use std::time::Instant;
use walkdir::WalkDir;

/// プロジェクト走査の実行
pub fn scan_project_directory(
    project_path: &str,
    metadata_cache: &mut MetadataCache,
    entity_store: &mut EntityStore,
    ruby_store: &mut RubyDictionaryStore,
) -> Result<ProjectScanSummary, std::io::Error> {
    let start_time = Instant::now();
    let root = Path::new(project_path);
    if !root.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Project path not found: {}", project_path),
        ));
    }

    metadata_cache.clear();
    entity_store.clear();
    ruby_store.clear();

    let mut scanned_count = 0;

    for entry in WalkDir::new(root)
        .into_iter()
        .filter_entry(|e| {
            let file_name = e.file_name().to_string_lossy();
            // 不要な隠しフォルダやビルド成果物をスキップ
            !file_name.starts_with('.')
                && file_name != "node_modules"
                && file_name != "target"
                && file_name != "dist"
                && file_name != "dist-js"
        })
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "md" || ext == "markdown" {
                    scanned_count += 1;
                    if let Ok(content) = fs::read_to_string(path) {
                        let path_str = path.to_string_lossy().to_string();

                        // 1. Frontmatter 抽出
                        let (meta, body) = extract_frontmatter_static(&content);

                        // 2. メタデータキャッシュ格納
                        if meta.is_object() && !meta.as_object().unwrap().is_empty() {
                            metadata_cache.insert(path_str.clone(), meta.clone());

                            // 3. エンティティ抽出
                            if let Some(entity) = parse_entity_from_metadata(&path_str, &meta) {
                                entity_store.insert(entity);
                            }
                        }

                        // 4. ルビ抽出
                        let rubies = extract_rubies_from_text(body, &path_str);
                        for (surf, ruby) in rubies {
                            ruby_store.record_occurrence(&surf, &ruby, &path_str);
                        }
                    }
                }
            }
        }
    }

    let duration_ms = start_time.elapsed().as_millis() as u64;

    Ok(ProjectScanSummary {
        project_path: project_path.to_string(),
        total_files_scanned: scanned_count,
        total_entities: entity_store.get_all().len(),
        total_ruby_entries: ruby_store.build_entries().len(),
        duration_ms,
    })
}
