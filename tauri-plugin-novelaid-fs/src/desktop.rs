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

fn system_time_to_ms(time: SystemTime) -> u64 {
  time.duration_since(SystemTime::UNIX_EPOCH)
    .map(|d| d.as_millis() as u64)
    .unwrap_or(0)
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

  pub fn get_document_stat(&self, path: &Path) -> crate::Result<DocumentStat> {
    let path_str = path.to_string_lossy().to_string();
    match std::fs::metadata(path) {
      Ok(meta) => {
        let mtime = meta.modified().unwrap_or_else(|_| SystemTime::now());
        Ok(DocumentStat {
          path: path_str,
          exists: true,
          mtime_ms: system_time_to_ms(mtime),
          size: meta.len(),
        })
      }
      Err(_) => Ok(DocumentStat {
        path: path_str,
        exists: false,
        mtime_ms: 0,
        size: 0,
      }),
    }
  }

  pub fn read_file_binary(&self, path: &Path) -> crate::Result<Vec<u8>> {
    std::fs::read(path).map_err(crate::Error::Io)
  }

  pub fn read_document(&self, path: &Path) -> crate::Result<NovelaidDocument> {
    let document_type = self.get_document_type_internal(path);
    let base_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
    let file_title = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
    let extension = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_else(|| {
            let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
            if name.starts_with('.') && !name[1..].contains('.') {
                name[1..].to_lowercase()
            } else {
                String::new()
            }
        });
    let mtime = std::fs::metadata(path)
        .and_then(|m| m.modified())
        .unwrap_or_else(|_| SystemTime::now());
    let mtime_ms = system_time_to_ms(mtime);

    // 画像ファイルはバイナリのためテキストとして読み込まず、安全に空本文で返却
    if document_type == NovelaidDocumentType::Image {
      return Ok(NovelaidDocument {
        path: path.to_string_lossy().to_string(),
        base_name,
        file_title,
        extension,
        content: String::new(),
        metadata: serde_json::json!({}),
        document_type,
        mtime_ms,
      });
    }

    // テキストファイル読み込み試行 (バイナリや未知の形式でUTF-8デコード失敗時はUnknownとして安全返却)
    match std::fs::read_to_string(path) {
      Ok(content) => {
        // Code形式の場合はFrontmatter解析を行わず、純粋な生テキストとして扱う
        let (metadata, body) = if document_type == NovelaidDocumentType::Code {
          (serde_json::json!({}), content.as_str())
        } else {
          self.extract_frontmatter(&content)
        };

        // Update cache
        if document_type != NovelaidDocumentType::Code {
          let mut cache = self.metadata_cache.lock().unwrap();
          cache.insert(path.to_string_lossy().to_string(), CacheEntry {
              metadata: metadata.clone(),
              mtime,
          });
        }

        Ok(NovelaidDocument {
          path: path.to_string_lossy().to_string(),
          base_name,
          file_title,
          extension,
          content: body.to_string(),
          metadata,
          document_type,
          mtime_ms,
        })
      }
      Err(_) => {
        // 非テキストファイルまたは読み込み不可ファイル
        Ok(NovelaidDocument {
          path: path.to_string_lossy().to_string(),
          base_name,
          file_title,
          extension,
          content: String::new(),
          metadata: serde_json::json!({}),
          document_type: NovelaidDocumentType::Unknown,
          mtime_ms,
        })
      }
    }
  }

  pub fn write_document(&self, path: &Path, document: NovelaidDocument) -> crate::Result<u64> {
    // Code形式の場合はFrontmatterを付与せず、純粋な生テキストとして保存
    let full_content = if document.document_type == NovelaidDocumentType::Code {
      document.content
    } else {
      self.format_frontmatter(&document.metadata, &document.content)
    };
    
    // 1. 保存開始前の現在時刻を取得 (A)
    let time_before_write = SystemTime::now();

    // 2. ファイルの保存
    std::fs::write(path, full_content).map_err(crate::Error::Io)?;
    
    // Invalidate attributes cache if modifying .novelaidattributes
    self.attributes_manager.invalidate_if_attributes_file(path);

    // 3. ファイルの更新日時の取得 (B) とリトライ検証 (B >= A)
    let mut mtime = std::fs::metadata(path)
        .and_then(|m| m.modified())
        .unwrap_or(time_before_write);

    let mut retries = 0;
    while mtime < time_before_write && retries < 10 {
      std::thread::sleep(std::time::Duration::from_millis(10));
      if let Ok(meta) = std::fs::metadata(path) {
        if let Ok(modified) = meta.modified() {
          mtime = modified;
        }
      }
      retries += 1;
    }

    let mtime_ms = system_time_to_ms(mtime);

    // Update cache
    {
      let mut cache = self.metadata_cache.lock().unwrap();
      cache.insert(path.to_string_lossy().to_string(), CacheEntry {
          metadata: document.metadata,
          mtime,
      });
    }
    
    Ok(mtime_ms)
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

  pub fn create_next_file(&self, dir_path: &Path) -> crate::Result<NovelaidDirEntry> {
    std::fs::create_dir_all(dir_path).map_err(crate::Error::Io)?;

    let mut existing_files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir_path) {
      for entry in entries.flatten() {
        if let Ok(file_type) = entry.file_type() {
          if file_type.is_file() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with('.') {
              existing_files.push(name);
            }
          }
        }
      }
    }

    let folder_name = dir_path.file_name().unwrap_or_default().to_string_lossy().to_string();
    let doc_type = self.attributes_manager.get_directory_type(dir_path, None);
    let next_file_name = crate::predictor::predict_next_file_name(&existing_files, &folder_name, doc_type);
    let target_path = dir_path.join(&next_file_name);

    std::fs::write(&target_path, "").map_err(crate::Error::Io)?;
    self.attributes_manager.invalidate_if_attributes_file(&target_path);

    let file_doc_type = self.attributes_manager.get_document_type(&target_path);
    let base_name = next_file_name.clone();
    let file_title = target_path.file_stem().unwrap_or_default().to_string_lossy().to_string();
    let extension = target_path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    Ok(NovelaidDirEntry {
      name: next_file_name,
      path: target_path.to_string_lossy().to_string(),
      base_name,
      file_title,
      extension,
      is_directory: false,
      document_type: file_doc_type,
      children: None,
    })
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

  pub fn copy(&self, source_path: &Path, target_path: &Path) -> crate::Result<()> {
    if source_path.is_dir() {
      copy_dir_recursive(source_path, target_path).map_err(crate::Error::Io)?;
    } else {
      if let Some(parent) = target_path.parent() {
        std::fs::create_dir_all(parent).map_err(crate::Error::Io)?;
      }
      std::fs::copy(source_path, target_path).map_err(crate::Error::Io)?;
    }
    self.attributes_manager.invalidate_if_attributes_file(target_path);
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

  /// プロジェクト内の Markdown/Novel ドキュメントを走査して NovelaidDocument 一覧を返却
  pub fn scan_documents(&self, project_path: &Path) -> crate::Result<Vec<NovelaidDocument>> {
    let mut documents = Vec::new();
    if !project_path.exists() {
      return Ok(documents);
    }

    for entry in walkdir::WalkDir::new(project_path)
      .into_iter()
      .filter_entry(|e| {
        let name = e.file_name().to_string_lossy();
        !name.starts_with('.') && name != "node_modules" && name != "target" && name != "dist" && name != "dist-js"
      })
      .filter_map(|e| e.ok())
    {
      let path = entry.path();
      if path.is_file() {
        if let Some(ext) = path.extension() {
          let ext_str = ext.to_string_lossy().to_lowercase();
          if ext_str == "md" || ext_str == "markdown" || ext_str == "txt" {
            if let Ok(doc) = self.read_document(path) {
              documents.push(doc);
            }
          }
        }
      }
    }
    Ok(documents)
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

fn copy_dir_recursive(src: &Path, dest: &Path) -> std::io::Result<()> {
  std::fs::create_dir_all(dest)?;
  for entry in std::fs::read_dir(src)? {
    let entry = entry?;
    let entry_path = entry.path();
    let target_path = dest.join(entry.file_name());
    if entry_path.is_dir() {
      copy_dir_recursive(&entry_path, &target_path)?;
    } else {
      std::fs::copy(&entry_path, &target_path)?;
    }
  }
  Ok(())
}
