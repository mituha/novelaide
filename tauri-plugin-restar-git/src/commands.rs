use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use crate::error::{Error, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String, // "modified", "added", "deleted", "renamed", "untracked"
    #[serde(rename = "isStaged")]
    pub is_staged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommitLog {
    pub hash: String,
    #[serde(rename = "shortHash")]
    pub short_hash: String,
    #[serde(rename = "authorName")]
    pub author_name: String,
    #[serde(rename = "authorEmail")]
    pub author_email: String,
    pub date: String,
    pub message: String,
    pub parents: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitRepoStatus {
    #[serde(rename = "isRepo")]
    pub is_repo: bool,
    #[serde(rename = "currentBranch")]
    pub current_branch: String,
    pub staged: Vec<GitFileStatus>,
    pub unstaged: Vec<GitFileStatus>,
    pub untracked: Vec<GitFileStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitDiffResult {
    #[serde(rename = "filePath")]
    pub file_path: String,
    #[serde(rename = "originalContent")]
    pub original_content: String,
    #[serde(rename = "modifiedContent")]
    pub modified_content: String,
    #[serde(rename = "diffText")]
    pub diff_text: String,
}

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn run_git(repo_path: &str, args: &[&str]) -> Result<String> {
    let mut cmd = std::process::Command::new("git");
    cmd.current_dir(Path::new(repo_path))
        .args(["-c", "core.quotepath=false"]) // 日本語ファイル名のエスケープ防止
        .args(args);

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(Error::Git(stderr));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub async fn git_is_repo(path: String) -> Result<bool> {
    let git_dir = PathBuf::from(&path).join(".git");
    Ok(git_dir.exists())
}

#[tauri::command]
pub async fn git_init(path: String) -> Result<()> {
    run_git(&path, &["init"])?;
    Ok(())
}

#[tauri::command]
pub async fn git_status(path: String) -> Result<GitRepoStatus> {
    let is_repo = PathBuf::from(&path).join(".git").exists();
    if !is_repo {
        return Ok(GitRepoStatus {
            is_repo: false,
            current_branch: "".to_string(),
            staged: Vec::new(),
            unstaged: Vec::new(),
            untracked: Vec::new(),
        });
    }

    // ブランチ名の取得
    let branch_out = run_git(&path, &["branch", "--show-current"]).unwrap_or_default();
    let current_branch = branch_out.trim().to_string();

    // ステータスの取得 (porcelain)
    let status_out = run_git(&path, &["status", "--porcelain=v1", "-u"]).unwrap_or_default();

    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();

    for line in status_out.lines() {
        if line.len() < 4 {
            continue;
        }

        let index_char = line.chars().nth(0).unwrap_or(' ');
        let work_char = line.chars().nth(1).unwrap_or(' ');
        let file_path = line[3..].trim().to_string();

        if index_char == '?' && work_char == '?' {
            untracked.push(GitFileStatus {
                path: file_path,
                status: "untracked".to_string(),
                is_staged: false,
            });
            continue;
        }

        // Staged
        if index_char != ' ' && index_char != '?' {
            let status = match index_char {
                'M' => "modified",
                'A' => "added",
                'D' => "deleted",
                'R' => "renamed",
                _ => "modified",
            };
            staged.push(GitFileStatus {
                path: file_path.clone(),
                status: status.to_string(),
                is_staged: true,
            });
        }

        // Unstaged
        if work_char != ' ' && work_char != '?' {
            let status = match work_char {
                'M' => "modified",
                'D' => "deleted",
                _ => "modified",
            };
            unstaged.push(GitFileStatus {
                path: file_path,
                status: status.to_string(),
                is_staged: false,
            });
        }
    }

    Ok(GitRepoStatus {
        is_repo: true,
        current_branch: if current_branch.is_empty() { "HEAD".to_string() } else { current_branch },
        staged,
        unstaged,
        untracked,
    })
}

#[tauri::command]
pub async fn git_stage(path: String, files: Vec<String>) -> Result<()> {
    if files.is_empty() {
        run_git(&path, &["add", "-A"])?;
    } else {
        let mut args = vec!["add", "--"];
        let file_refs: Vec<&str> = files.iter().map(|s| s.as_str()).collect();
        args.extend(file_refs);
        run_git(&path, &args)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn git_unstage(path: String, files: Vec<String>) -> Result<()> {
    if files.is_empty() {
        run_git(&path, &["reset", "HEAD"])?;
    } else {
        let mut args = vec!["reset", "HEAD", "--"];
        let file_refs: Vec<&str> = files.iter().map(|s| s.as_str()).collect();
        args.extend(file_refs);
        run_git(&path, &args)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn git_commit(path: String, message: String, stage_all: bool) -> Result<String> {
    if stage_all {
        run_git(&path, &["add", "-A"])?;
    }
    let res = run_git(&path, &["commit", "-m", &message])?;
    Ok(res)
}

#[tauri::command]
pub async fn git_log(path: String, max_count: Option<u32>) -> Result<Vec<GitCommitLog>> {
    let limit = max_count.unwrap_or(50).to_string();
    let format = "%H%x00%h%x00%an%x00%ae%x00%aI%x00%s%x00%P";
    let output = match run_git(&path, &["log", "--all", "-n", &limit, &format!("--format={}", format)]) {
        Ok(out) => out,
        Err(_) => return Ok(Vec::new()), // 初期コミットがない場合は空
    };

    let mut logs = Vec::new();
    for line in output.lines() {
        let parts: Vec<&str> = line.split('\0').collect();
        if parts.len() >= 6 {
            let parents_str = parts.get(6).unwrap_or(&"");
            let parents: Vec<String> = if parents_str.is_empty() {
                Vec::new()
            } else {
                parents_str.split_whitespace().map(|s| s.to_string()).collect()
            };

            logs.push(GitCommitLog {
                hash: parts[0].to_string(),
                short_hash: parts[1].to_string(),
                author_name: parts[2].to_string(),
                author_email: parts[3].to_string(),
                date: parts[4].to_string(),
                message: parts[5].to_string(),
                parents,
            });
        }
    }

    Ok(logs)
}

#[tauri::command]
pub async fn git_diff_file(path: String, file_path: String, staged: bool) -> Result<GitDiffResult> {
    // 比較元（HEADの内容）を取得
    let original = if staged {
        run_git(&path, &["show", &format!("HEAD:{}", file_path)]).unwrap_or_default()
    } else {
        // 未ステージの場合はステージ（インデックス）またはHEAD
        match run_git(&path, &["show", &format!(":{}", file_path)]) {
            Ok(content) => content,
            Err(_) => run_git(&path, &["show", &format!("HEAD:{}", file_path)]).unwrap_or_default(),
        }
    };

    // 比較先（現在の作業ツリー、またはステージ内容）
    let modified = if staged {
        run_git(&path, &["show", &format!(":{}", file_path)]).unwrap_or_default()
    } else {
        let full_path = PathBuf::from(&path).join(&file_path);
        std::fs::read_to_string(full_path).unwrap_or_default()
    };

    // diffテキストの取得
    let diff_args = if staged {
        vec!["diff", "--cached", "--", file_path.as_str()]
    } else {
        vec!["diff", "--", file_path.as_str()]
    };
    let diff_text = run_git(&path, &diff_args).unwrap_or_default();

    Ok(GitDiffResult {
        file_path,
        original_content: original,
        modified_content: modified,
        diff_text,
    })
}

#[tauri::command]
pub async fn git_discard(path: String, file_path: String) -> Result<()> {
    // 未追跡ファイルなら削除、追跡済みなら checkout
    let full_path = PathBuf::from(&path).join(&file_path);
    if full_path.exists() {
        let status = run_git(&path, &["status", "--porcelain=v1", "--", &file_path]).unwrap_or_default();
        if status.starts_with("??") {
            if full_path.is_file() {
                std::fs::remove_file(full_path)?;
            } else if full_path.is_dir() {
                std::fs::remove_dir_all(full_path)?;
            }
            return Ok(());
        }
    }

    run_git(&path, &["checkout", "--", &file_path])?;
    Ok(())
}
