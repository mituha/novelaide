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

## 4. リリース手順

新しいバージョンをリリースする際は、以下のステップで進めます：

1. `npm version patch`（または minor）でバージョンを更新（`package.json`, `tauri.conf.json`, `Cargo.toml` の連動確認）。
2. Git コミットを作成。
3. バージョンタグを付与して push：
   ```pwsh
   git tag v0.18.9
   git push origin main --tags
   ```
4. GitHub Actions の `Release` ジョブが自動起動し、約5〜10分で [GitHub Releases](https://github.com/mituha/novelaide/releases) にドラフトが生成されます。
