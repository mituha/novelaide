use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NovelaidDirEntry {
    pub name: String,
    pub path: String,
    pub base_name: String,
    pub file_title: String,
    pub is_directory: bool,
    pub document_type: String,
    pub children: Option<Vec<NovelaidDirEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NovelaidDocument {
    pub path: String,
    pub base_name: String,
    pub file_title: String,
    pub content: String,
    pub document_type: String,
}

// ドキュメント種別の自動判定
fn detect_document_type(path: &Path, is_directory: bool) -> String {
    if is_directory {
        let name = path.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
        if name.contains("小説") || name.contains("novel") || name.contains("原稿") {
            return "novel".to_string();
        }
        if name.contains("設定") || name.contains("プロット") || name.contains("plot") || name.contains("characters") {
            return "markdown".to_string();
        }
        if name.contains("画像") || name.contains("image") || name.contains("assets") {
            return "image".to_string();
        }
        return "directory".to_string();
    }

    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "txt" => "novel".to_string(),
        "md" => "markdown".to_string(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" => "image".to_string(),
        "chat" => "chat".to_string(),
        "css" => "css".to_string(),
        "json" | "yaml" | "yml" => "metadata".to_string(),
        _ => "unknown".to_string(),
    }
}

// フォルダ一覧の再帰読み込み
fn read_dir_internal(path: &Path, recursive: bool) -> Result<Vec<NovelaidDirEntry>, String> {
    let mut entries = Vec::new();
    let read_dir = fs::read_dir(path).map_err(|e| format!("フォルダの読み込みに失敗しました ({}): {}", path.display(), e))?;

    for entry_res in read_dir {
        let entry = match entry_res {
            Ok(e) => e,
            Err(_) => continue,
        };

        let entry_path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        // 隠しフォルダ・ファイル（.git 等）は除外
        if file_name.starts_with('.') {
            continue;
        }

        let is_dir = entry_path.is_dir();
        let doc_type = detect_document_type(&entry_path, is_dir);

        let base_name = entry_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let file_title = entry_path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let children = if is_dir && recursive {
            Some(read_dir_internal(&entry_path, true)?)
        } else {
            None
        };

        entries.push(NovelaidDirEntry {
            name: file_name,
            path: entry_path.to_string_lossy().to_string(),
            base_name,
            file_title,
            is_directory: is_dir,
            document_type: doc_type,
            children,
        });
    }

    // ディレクトリ優先、名前順ソート
    entries.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

#[tauri::command]
pub fn fs_read_dir(path: String, recursive: bool) -> Result<Vec<NovelaidDirEntry>, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("指定されたパスが存在しません: {}", path));
    }
    read_dir_internal(p, recursive)
}

#[tauri::command]
pub fn fs_read_file(path: String) -> Result<NovelaidDocument, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("ファイルが見つかりません: {}", path));
    }

    let content = fs::read_to_string(p).map_err(|e| format!("ファイルの読み込みに失敗しました: {}", e))?;
    let doc_type = detect_document_type(p, false);

    Ok(NovelaidDocument {
        path: path.clone(),
        base_name: p.file_name().unwrap_or_default().to_string_lossy().to_string(),
        file_title: p.file_stem().unwrap_or_default().to_string_lossy().to_string(),
        content,
        document_type: doc_type,
    })
}

#[tauri::command]
pub fn fs_write_file(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("親フォルダの作成に失敗しました: {}", e))?;
        }
    }
    fs::write(p, content).map_err(|e| format!("ファイルの書き込みに失敗しました: {}", e))
}

#[tauri::command]
pub fn fs_create_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err("同名のファイルが既に存在します".to_string());
    }
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("親フォルダの作成に失敗しました: {}", e))?;
        }
    }
    fs::write(p, "").map_err(|e| format!("ファイルの作成に失敗しました: {}", e))
}

#[tauri::command]
pub fn fs_create_dir(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err("同名のフォルダが既に存在します".to_string());
    }
    fs::create_dir_all(p).map_err(|e| format!("フォルダの作成に失敗しました: {}", e))
}

#[tauri::command]
pub fn fs_remove(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("削除対象のパスが存在しません".to_string());
    }
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| format!("フォルダの削除に失敗しました: {}", e))
    } else {
        fs::remove_file(p).map_err(|e| format!("ファイルの削除に失敗しました: {}", e))
    }
}

#[tauri::command]
pub fn fs_rename(old_path: String, new_path: String) -> Result<(), String> {
    let src = Path::new(&old_path);
    let dst = Path::new(&new_path);
    if !src.exists() {
        return Err("変更前のパスが存在しません".to_string());
    }
    if dst.exists() {
        return Err("変更後のファイル名が既に存在します".to_string());
    }
    fs::rename(src, dst).map_err(|e| format!("ファイル名の変更に失敗しました: {}", e))
}
