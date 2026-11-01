use tauri::{AppHandle, command, Runtime};

use crate::models::*;
use crate::Result;
use crate::NovelaidFsExt;

#[command]
pub(crate) async fn ping<R: Runtime>(
    app: AppHandle<R>,
    payload: PingRequest,
) -> Result<PingResponse> {
    app.novelaid_fs().ping(payload)
}

fn read_dir_recursive<R: Runtime>(
    app: &AppHandle<R>,
    path: &std::path::Path,
    recursive: bool,
    parent_type: Option<NovelaidDocumentType>,
) -> std::result::Result<Vec<NovelaidDirEntry>, std::io::Error> {
    let mut entries = vec![];
    let dir = std::fs::read_dir(path)?;
    let novelaid_fs = app.novelaid_fs();

    for entry in dir {
        let entry = entry?;
        let path_buf = entry.path();
        let file_type = entry.file_type()?;
        let is_directory = file_type.is_dir();
        let name = entry.file_name().to_string_lossy().to_string();

        // . で始まるフォルダ（ディレクトリ）は除外する（ファイルは保持）
        if is_directory && name.starts_with('.') {
            continue;
        }

        let document_type = if is_directory {
            novelaid_fs.attributes_manager.get_directory_type(&path_buf, parent_type)
        } else {
            novelaid_fs.attributes_manager.get_document_type(&path_buf)
        };

        // メタデータスキャンが必要なファイル形式である場合、非同期キャッシュ更新判定を行う
        if !is_directory && matches!(document_type, NovelaidDocumentType::Novel | NovelaidDocumentType::Markdown) {
            let path_str = path_buf.to_string_lossy().to_string();
            
            let file_mtime = std::fs::metadata(&path_buf)
                .and_then(|m| m.modified())
                .unwrap_or(std::time::SystemTime::now());

            let needs_scan = {
                let cache = novelaid_fs.metadata_cache.lock().unwrap();
                match cache.get(&path_str) {
                    Some(entry) => file_mtime > entry.mtime,
                    None => true,
                }
            };

            if needs_scan {
                use std::sync::atomic::Ordering;
                novelaid_fs.total_jobs.fetch_add(1, Ordering::SeqCst);
                let _ = novelaid_fs.queue_tx.send(path_buf.clone());
            }
        }

        let path = path_buf.to_string_lossy().to_string();
        let base_name = path_buf.file_name().unwrap_or_default().to_string_lossy().to_string();
        let file_title = path_buf.file_stem().unwrap_or_default().to_string_lossy().to_string();

        let children = if is_directory && recursive {
            Some(read_dir_recursive(app, &path_buf, true, Some(document_type))?)
        } else {
            None
        };

        entries.push(NovelaidDirEntry {
            name,
            path,
            base_name,
            file_title,
            is_directory,
            document_type,
            children,
        });
    }
    
    // Sort directories first, then alphabetical
    entries.sort_by(|a, b| {
        match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.cmp(&b.name),
        }
    });

    Ok(entries)
}

#[command]
pub(crate) async fn read_directory<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    recursive: bool,
    parent_type: Option<NovelaidDocumentType>,
) -> Result<Vec<NovelaidDirEntry>> {
    tauri::async_runtime::spawn_blocking(move || {
        read_dir_recursive(&app, std::path::Path::new(&path), recursive, parent_type)
    })
    .await
    .unwrap_or_else(|e| Err(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))
    .map_err(crate::Error::Io)
}

#[command]
pub(crate) fn get_document_type<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> NovelaidDocumentType {
    app.novelaid_fs().attributes_manager.get_document_type(std::path::Path::new(&path))
}

#[command]
pub(crate) fn get_directory_type<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    parent_type: Option<NovelaidDocumentType>,
) -> NovelaidDocumentType {
    app.novelaid_fs().attributes_manager.get_directory_type(std::path::Path::new(&path), parent_type)
}

#[command]
pub(crate) async fn set_project_directory<R: Runtime>(
    app: AppHandle<R>,
    path: Option<String>,
) -> Result<()> {
    app.novelaid_fs()
        .set_project_directory(path.map(std::path::PathBuf::from));
    Ok(())
}

#[command]
pub(crate) async fn get_project_directory<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<String>> {
    Ok(app
        .novelaid_fs()
        .get_project_directory()
        .map(|p| p.to_string_lossy().to_string()))
}

#[command]
pub(crate) async fn get_document_stat<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<DocumentStat> {
    app.novelaid_fs().get_document_stat(std::path::Path::new(&path))
}

#[command]
pub(crate) async fn read_document<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<NovelaidDocument> {
    app.novelaid_fs().read_document(std::path::Path::new(&path))
}

#[command]
pub(crate) async fn write_document<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    document: NovelaidDocument,
) -> Result<u64> {
    app.novelaid_fs().write_document(std::path::Path::new(&path), document)
}

#[command]
pub(crate) async fn create_directory<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<()> {
    app.novelaid_fs().create_directory(std::path::Path::new(&path))?;
    use tauri::Emitter;
    let _ = app.emit("fs:changed", FsChangeEvent {
        action: "create".into(),
        path,
        new_path: None,
    });
    Ok(())
}

#[command]
pub(crate) async fn create_file<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    content: Option<String>,
) -> Result<()> {
    app.novelaid_fs().create_file(std::path::Path::new(&path), content.as_deref())?;
    use tauri::Emitter;
    let _ = app.emit("fs:changed", FsChangeEvent {
        action: "create".into(),
        path,
        new_path: None,
    });
    Ok(())
}

#[command]
pub(crate) async fn create_next_file<R: Runtime>(
    app: AppHandle<R>,
    dir_path: String,
) -> Result<NovelaidDirEntry> {
    let entry = app.novelaid_fs().create_next_file(std::path::Path::new(&dir_path))?;
    use tauri::Emitter;
    let _ = app.emit("fs:changed", FsChangeEvent {
        action: "create".into(),
        path: entry.path.clone(),
        new_path: None,
    });
    Ok(entry)
}

#[command]
pub(crate) async fn remove<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    force: Option<bool>,
) -> Result<RemoveResult> {
    let target = std::path::Path::new(&path);
    if !target.exists() {
        return Ok(RemoveResult::NotFound);
    }

    let skip_confirm = force.unwrap_or(false);
    if !skip_confirm {
        let is_directory = target.is_dir();
        let file_name = target
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());

        return Ok(RemoveResult::NeedConfirm {
            file_name,
            is_directory,
        });
    }

    app.novelaid_fs().remove(target)?;

    use tauri::Emitter;
    let _ = app.emit(
        "fs:changed",
        FsChangeEvent {
            action: "delete".into(),
            path,
            new_path: None,
        },
    );

    Ok(RemoveResult::Success)
}

#[command]
pub(crate) async fn rename<R: Runtime>(
    app: AppHandle<R>,
    old_path: String,
    new_path: String,
) -> Result<()> {
    app.novelaid_fs().rename(std::path::Path::new(&old_path), std::path::Path::new(&new_path))?;
    use tauri::Emitter;
    let _ = app.emit(
        "fs:changed",
        FsChangeEvent {
            action: "rename".into(),
            path: old_path,
            new_path: Some(new_path),
        },
    );
    Ok(())
}

#[command]
pub(crate) async fn copy<R: Runtime>(
    app: AppHandle<R>,
    source_path: String,
    target_path: String,
) -> Result<()> {
    app.novelaid_fs().copy(std::path::Path::new(&source_path), std::path::Path::new(&target_path))?;
    use tauri::Emitter;
    let _ = app.emit(
        "fs:changed",
        FsChangeEvent {
            action: "copy".into(),
            path: source_path,
            new_path: Some(target_path),
        },
    );
    Ok(())
}

#[command]
pub(crate) async fn get_metadata_cache<R: Runtime>(
    app: AppHandle<R>,
) -> Result<std::collections::HashMap<String, serde_json::Value>> {
    Ok(app.novelaid_fs().get_metadata_cache())
}

#[command]
pub(crate) async fn scan_documents<R: Runtime>(
    app: AppHandle<R>,
    project_path: String,
) -> Result<Vec<NovelaidDocument>> {
    app.novelaid_fs().scan_documents(std::path::Path::new(&project_path))
}
