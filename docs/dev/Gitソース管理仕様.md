# Gitソース管理実装仕様書（tauri-plugin-restar-git）

## 1. 概要とアーキテクチャ方針

本ドキュメントは、**`novelaide`** における Git ソース管理機能を、独立した Tauri プラグイン **`tauri-plugin-restar-git`（npm: `restar-app-git`）** として構築・連携するための実装仕様を定義するものです。

用語は開発者向けのGit用語（`Commit`, `Stage / Unstage`, `Branch`, `Diff`, `Log` 等）を使用し、システムの `git` コマンドを Rust バックエンドから直接実行することで、ユーザー自身の Git 設定（名前、メール、SSH/GPG鍵、認証ヘルパー）と完全互換を保ちます。

---

## 2. ディレクトリ構成

```text
tauri-plugin-restar-git/
├── Cargo.toml                       # Rustクレート定義
├── build.rs                         # Tauriコマンドパーミッション生成
├── permissions/
│   └── default.toml                 # デフォルト許可パーミッション
├── src/
│   ├── lib.rs                       # プラグイン初期化
│   ├── commands.rs                  # Git IPCコマンド群
│   └── error.rs                     # エラーハンドリング
├── guest-js/
│   ├── index.ts                     # APIエクスポート
│   ├── types.ts                     # GitFileStatus, GitCommitLog, GitRepoStatus, GitDiffResult
│   └── client.ts                    # invoke ラッパー関数
├── package.json                     # "name": "restar-app-git"
├── tsconfig.json
└── rollup.config.js                 # dist-js へのバンドル

novelaide/
├── src/
│   ├── contexts/
│   │   └── GitContext.tsx           # Git状態管理コンテキスト
│   ├── components/
│   │   ├── Git/
│   │   │   ├── GitPanel.tsx         # 左サイドペイン用 Git パネル
│   │   │   ├── GitPanel.css
│   │   │   ├── GitGraph.tsx         # コミット履歴グラフ
│   │   │   └── GitGraph.css
│   │   └── Diff/
│   │       ├── DiffEditorView.tsx   # Monaco Diff Editor ビュー
│   │       └── DiffEditorView.css
│   └── plugins/
│       ├── panels/
│       │   └── GitPanelPlugin.tsx   # PanelRegistry 登録 (novelaid.panel.git)
│       └── views/
│           └── DiffViewPlugin.ts    # ViewRegistry 登録 (novelaid.view.diff)
```

---

## 3. Rust実装仕様 (`src/commands.rs`)

### 3.1 実行ヘルパー関数
```rust
fn run_git_command(repo_path: &Path, args: &[&str]) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .current_dir(repo_path)
        .args(["-c", "core.quotepath=false"]) // 日本語ファイル名エスケープ防止
        .args(args)
        .output()
        .map_err(|e| format!("Failed to execute git: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(stderr.to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
```

### 3.2 コマンド一覧
- `git_is_repo(path: String) -> bool`
- `git_init(path: String) -> Result<(), String>`
- `git_status(path: String) -> Result<GitRepoStatus, String>`:
  - `git status --porcelain=v1 -u` をパースし、`staged`, `unstaged`, `untracked` に分類
  - `git branch --show-current` で現在のブランチを取得
- `git_stage(path: String, files: Vec<String>) -> Result<(), String>`:
  - `git add <files>` （空配列時は `git add -A`）
- `git_unstage(path: String, files: Vec<String>) -> Result<(), String>`:
  - `git reset HEAD <files>` （空配列時は `git reset HEAD`）
- `git_commit(path: String, message: String, stage_all: bool) -> Result<String, String>`:
  - `stage_all` が true の場合は事前に `git add -A` を実行後、`git commit -m <message>`
- `git_log(path: String, max_count: Option<u32>) -> Result<Vec<GitCommitLog>, String>`:
  - `git log --all -n <count> --format="%H%x00%h%x00%an%x00%ae%x00%aI%x00%s%x00%P"` を取得してパース
- `git_diff_file(path: String, file_path: String, staged: bool) -> Result<GitDiffResult, String>`:
  - HEADの内容、作業ツリーの内容、および `git diff` テキストを取得
- `git_discard(path: String, file_path: String) -> Result<(), String>`:
  - `git checkout -- <file_path>` または `git clean -f <file_path>`

---

## 4. UI仕様

1. **左アクティビティバー**:
   - `GitBranch` / `GitCommit` アイコンを配置（3番目）。
   - クリックで `GitPanel` が左サイドペインに展開。
2. **`GitPanel`（左ペイン）**:
   - **ブランチ & 再読み込み**: `🌿 main` とリフレッシュボタン。
   - **コミットメッセージ入力欄**: 複数行テキストエリア、ショートカット `Ctrl + Enter` でコミット。
   - **Commit ボタン**: 「Commit」または「Commit All」。
   - **Staged Changes アコーディオン**: ステージ済みファイル、一括/個別アンステージボタン。
   - **Changes アコーディオン**: 未ステージ/新規ファイル、一括/個別ステージボタン、変更破棄ボタン。
   - **Commit History アコーディオン**: コミットハッシュ、メッセージ、作者、経過時間、SVGコミットグラフ。
3. **Monaco `<DiffEditor />`（中央ビュー）**:
   - リスト内のファイルをクリックすると、中央エディターで差分比較タブが開き、行・文字単位のハイライトを表示。

---

## 5. UIスクリーンショット

![Gitソース管理パネルと差分比較（ダークモード）](./images/15_Gitソース管理と差分比較_ダークモード.png)

