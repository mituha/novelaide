# GitHub ビルドおよびリリースワークフロー仕様書

## 1. 概要

本ドキュメントは、**`novelaide`** の GitHub リポジトリ（`https://github.com/mituha/novelaide`）における継続的インテグレーション（CI）および自動リリース（CD）ワークフローの設計仕様を定義するものです。

---

## 2. ワークフロー一覧

| ワークフロー名 | ファイルパス | トリガー | 主な目的 |
| :--- | :--- | :--- | :--- |
| **CI** | `.github/workflows/ci.yml` | `main` への push / PR / 手動 | TypeScript型検査、Viteビルド、Rustコンパイル検証 |
| **Release** | `.github/workflows/release.yml` | `v*` タグの push / 手動 | Windows用インストーラー（EXE / MSI）ビルドとGitHub Release自動公開 |

---

## 3. 各ワークフローの詳細

### 3.1 CI ワークフロー (`ci.yml`)

プルリクエストやブランチプッシュ時に、コードの品質とビルド可能性を自動検証します。

1. **環境セットアップ**:
   - ランナー: `windows-latest`
   - Node.js: `v20`（npmキャッシュ有効）
   - Rust: `stable`（`swatinem/rust-cache@v2` によるビルドキャッシュ有効）
2. **ステップ**:
   - `npm ci`
   - `npm run build:plugins`（内蔵プラグインのビルド）
   - `npm run build`（フロントエンドの型検査 `tsc` および Vite バンドル）
   - `cargo check --manifest-path src-tauri/Cargo.toml`（Rustバックエンドの型検査）

---

### 3.2 Release ワークフロー (`release.yml`)

バージョンタグ（例: `v0.18.9`）がプッシュされた際、配布用バイナリとインストーラーを自動生成し、GitHub Release のドラフトを作成します。

1. **利用アクション**:
   - 公式の [tauri-apps/tauri-action@v0](https://github.com/tauri-apps/tauri-action) を採用。
2. **生成されるアセット**:
   - `novelaide_<version>_x64-setup.exe`（NSIS インストーラー）
   - `novelaide_<version>_x64_en-US.msi`（Windows Installer パッケージ）
3. **公開設定**:
   - `releaseDraft: true`（ドラフト状態で作成され、内容確認後に即時正式公開可能）

---

## 4. リリース手順（一括自動実行）

`scripts/release.mjs`（および `scripts/release.ps1`）により、`package.json` のバージョン自動読み取り、タグ生成、およびリモートへのプッシュを一発で安全に実行できます。
リモート名が `origin` ではなく `github` 等になっている場合も自動検出されます。

### 4.1 基本的な実行方法

```pwsh
# 1. バージョンの更新（コミットを作成）
npm version patch --no-git-tag-version
git commit -am "chore: release v0.18.10"

# 2. リリーススクリプトの実行（タグ自動作成 ＆ リモートへプッシュ）
npm run release
```

### 4.2 オプションとカスタム指定

```pwsh
# 実行内容の事前確認（タグ作成やプッシュは行わない）
npm run release -- --dry-run

# リモートリポジトリを明示的に指定する場合
npm run release -- github

# PowerShell スクリプトを直接実行する場合
pwsh scripts/release.ps1 -Remote github -DryRun
```

実行後、GitHub Actions の `Release` ジョブが自動起動し、約5〜10分で [GitHub Releases](https://github.com/mituha/novelaide/releases) にインストーラー付きドラフトが生成されます。
