use std::{path::{Path, PathBuf}, sync::Mutex, collections::HashMap, sync::Arc, time::SystemTime};
use std::sync::atomic::{AtomicU32, Ordering};
use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime, Emitter};

use crate::attributes::AttributesManager;
use crate::models::*;

#[derive(Debug, Clone)]
pub struct CacheEntry {
    pub metadata: serde_json::Value,
    pub mtime: SystemTime,
}

pub fn init<R: Runtime, C: DeserializeOwned>(
  app: &AppHandle<R>,
  _api: PluginApi<R, C>,
) -> crate::Result<NovelaidFs<R>> {
  let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<PathBuf>();
  let metadata_cache = Arc::new(Mutex::new(HashMap::new()));
  let total_jobs = Arc::new(AtomicU32::new(0));
  let processed_jobs = Arc::new(AtomicU32::new(0));

  // バックグラウンド・メタデータスキャンワーカーの起動
  let app_clone = app.clone();
  let cache_clone = Arc::clone(&metadata_cache);
  let total_jobs_clone = Arc::clone(&total_jobs);
  let processed_jobs_clone = Arc::clone(&processed_jobs);

  tauri::async_runtime::spawn(async move {
    while let Some(path) = rx.recv().await {
      let path_str = path.to_string_lossy().to_string();
      let file_name = path.file_name()
          .map(|n| n.to_string_lossy().to_string())
          .unwrap_or_else(|| "".to_string());

      if let Ok(content) = std::fs::read_to_string(&path) {
        let (metadata, _) = extract_frontmatter_static(&content);
        let mtime = std::fs::metadata(&path)
            .and_then(|m| m.modified())
            .unwrap_or_else(|_| SystemTime::now());

        {
          let mut cache = cache_clone.lock().unwrap();
          cache.insert(path_str.clone(), CacheEntry {
              metadata: metadata.clone(),
              mtime,
          });
        }

        // カウンタの更新
        let processed = processed_jobs_clone.fetch_add(1, Ordering::SeqCst) + 1;
        let total = total_jobs_clone.load(Ordering::SeqCst);

        // 進捗イベント通知用ペイロード
        #[derive(Clone, serde::Serialize)]
        #[serde(rename_all = "camelCase")]
        struct ScanProgressPayload {
            processed: u32,
            total: u32,
            current_file: String,
        }

        let _ = app_clone.emit("fs:metadata-scan-progress", ScanProgressPayload {
            processed,
            total,
            current_file: file_name,
        });

        // 完了時のカウンタリセット
        if processed >= total {
          processed_jobs_clone.store(0, Ordering::SeqCst);
          total_jobs_clone.store(0, Ordering::SeqCst);
        }

        // フロントエンドにメタデータ更新イベントを通知
        #[derive(Clone, serde::Serialize)]
        #[serde(rename_all = "camelCase")]
        struct MetadataUpdatedPayload {
            path: String,
            metadata: serde_json::Value,
        }

        let _ = app_clone.emit("fs:metadata-updated", MetadataUpdatedPayload {
            path: path_str,
            metadata,
        });
      }
    }
  });

  let attributes_manager = Arc::new(AttributesManager::new());

  Ok(NovelaidFs {
    app: app.clone(),
    project_directory: Mutex::new(None),
    metadata_cache,
    attributes_manager,
    queue_tx: tx,
    total_jobs,
    processed_jobs,
  })
}

/// Access to the novelaid-fs APIs.
pub struct NovelaidFs<R: Runtime> {
  #[allow(dead_code)]
  app: AppHandle<R>,
  project_directory: Mutex<Option<PathBuf>>,
  pub metadata_cache: Arc<Mutex<HashMap<String, CacheEntry>>>,
  pub attributes_manager: Arc<AttributesManager>,
  pub queue_tx: tokio::sync::mpsc::UnboundedSender<PathBuf>,
  pub total_jobs: Arc<AtomicU32>,
  pub processed_jobs: Arc<AtomicU32>,
}

impl<R: Runtime> NovelaidFs<R> {
  pub fn ping(&self, payload: PingRequest) -> crate::Result<PingResponse> {
    Ok(PingResponse {
      value: payload.value,
    })
  }

  pub fn set_project_directory(&self, path: Option<PathBuf>) {
    let mut dir = self.project_directory.lock().unwrap();
    *dir = path;
    
    // Clear caches if path is set
    {
      let mut cache = self.metadata_cache.lock().unwrap();
      cache.clear();
    }
    self.attributes_manager.clear();
  }

  pub fn get_project_directory(&self) -> Option<PathBuf> {
    let dir = self.project_directory.lock().unwrap();
    dir.clone()
  }

  pub fn read_document(&self, path: &Path) -> crate::Result<NovelaidDocument> {
    let content = std::fs::read_to_string(path).map_err(crate::Error::Io)?;
    let (metadata, body) = self.extract_frontmatter(&content);
    
    let document_type = self.get_document_type_internal(path);
    
    // Update cache
    {
      let mut cache = self.metadata_cache.lock().unwrap();
      let mtime = std::fs::metadata(path)
          .and_then(|m| m.modified())
          .unwrap_or_else(|_| SystemTime::now());
      cache.insert(path.to_string_lossy().to_string(), CacheEntry {
          metadata: metadata.clone(),
          mtime,
      });
    }

    Ok(NovelaidDocument {
      path: path.to_string_lossy().to_string(),
      base_name: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
      file_title: path.file_stem().unwrap_or_default().to_string_lossy().to_string(),
      content: body.to_string(),
      metadata,
      document_type,
    })
  }

  pub fn write_document(&self, path: &Path, document: NovelaidDocument) -> crate::Result<()> {
    let full_content = self.format_frontmatter(&document.metadata, &document.content);
    std::fs::write(path, full_content).map_err(crate::Error::Io)?;
    
    // Invalidate attributes cache if modifying .novelaidattributes
    self.attributes_manager.invalidate_if_attributes_file(path);

    // Update cache
    {
      let mut cache = self.metadata_cache.lock().unwrap();
      let mtime = std::fs::metadata(path)
          .and_then(|m| m.modified())
          .unwrap_or_else(|_| SystemTime::now());
      cache.insert(path.to_string_lossy().to_string(), CacheEntry {
          metadata: document.metadata,
          mtime,
      });
    }
    
    Ok(())
  }

  pub fn create_directory(&self, path: &Path) -> crate::Result<()> {
    std::fs::create_dir_all(path).map_err(crate::Error::Io)?;
    Ok(())
  }

  pub fn create_file(&self, path: &Path, content: Option<&str>) -> crate::Result<()> {
    if let Some(parent) = path.parent() {
      std::fs::create_dir_all(parent).map_err(crate::Error::Io)?;
    }
    std::fs::write(path, content.unwrap_or("")).map_err(crate::Error::Io)?;
    self.attributes_manager.invalidate_if_attributes_file(path);
    Ok(())
  }

  pub fn remove(&self, path: &Path) -> crate::Result<()> {
    if path.is_dir() {
      std::fs::remove_dir_all(path).map_err(crate::Error::Io)?;
      self.attributes_manager.invalidate_dir(path);
    } else if path.is_file() {
      std::fs::remove_file(path).map_err(crate::Error::Io)?;
      self.attributes_manager.invalidate_if_attributes_file(path);
    }
    Ok(())
  }

  pub fn rename(&self, old_path: &Path, new_path: &Path) -> crate::Result<()> {
    std::fs::rename(old_path, new_path).map_err(crate::Error::Io)?;
    self.attributes_manager.invalidate_if_attributes_file(old_path);
    self.attributes_manager.invalidate_if_attributes_file(new_path);
    Ok(())
  }

  pub fn get_metadata_cache(&self) -> HashMap<String, serde_json::Value> {
    let cache = self.metadata_cache.lock().unwrap();
    cache.iter()
        .map(|(k, v)| (k.clone(), v.metadata.clone()))
        .collect()
  }

  fn extract_frontmatter<'a>(&self, content: &'a str) -> (serde_json::Value, &'a str) {
    extract_frontmatter_static(content)
  }

  fn format_frontmatter(&self, metadata: &serde_json::Value, content: &str) -> String {
    if metadata.is_object() && !metadata.as_object().unwrap().is_empty() {
      match serde_yaml::to_string(metadata) {
        Ok(yaml_str) => {
          format!("---\n{}---\n{}", yaml_str.trim_start_matches("---\n"), content)
        }
        Err(_) => content.to_string(),
      }
    } else {
      content.to_string()
    }
  }

  fn get_document_type_internal(&self, path: &Path) -> NovelaidDocumentType {
    self.attributes_manager.get_document_type(path)
  }
}

// バックグラウンドワーカーから self なしで呼び出せる静的フロントマター抽出ヘルパー
fn extract_frontmatter_static(content: &str) -> (serde_json::Value, &str) {
  if !content.starts_with("---\n") && !content.starts_with("---\r\n") {
    return (serde_json::json!({}), content);
  }

  let splitter = if content.contains("\r\n") { "\r\n" } else { "\n" };
  let fence = format!("---{}", splitter);
  
  let parts: Vec<&str> = content.splitn(3, &fence).collect();
  if parts.len() < 3 {
    return (serde_json::json!({}), content);
  }

  let yaml_str = parts[1];
  let body = parts[2];

  match serde_yaml::from_str::<serde_json::Value>(yaml_str) {
    Ok(metadata) => (metadata, body),
    Err(_) => (serde_json::json!({}), content),
  }
}
