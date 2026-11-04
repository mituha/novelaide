# Tauriインストーラー生成および日本語化仕様

## 1. 概要

本仕様書は、`novelaide`（Tauri v2 ベースの小説執筆用エディター）における配布用インストーラー（Windows向け NSIS / WiX）の生成仕様、日本語ローカライゼーション設定（UIメッセージ、言語優先順位、ダイアログ制御）、および最小限・安全設計の構成を定義するものです。

---

## 2. 設計方針と基本原則

本プロジェクトにおけるインストーラー設計は、以下の原則に従います：

1. **完全な日本語ローカライズ**:
   - 日本語Windows環境において、インストールウィザード（次へ、インストール先選択、完了など）が完全に日本語で案内されること。
   - 起動時の余分な言語選択ポップアップを抑制し、OS環境に合わせてスマートに日本語起動すること。
2. **最小限・安全設計（レジストリ侵襲の防止）**:
   - ファイル関連付け（`.ch` などの拡張子をレジストリに登録する処理）は**行わない**。ユーザーのOS環境に余計なレジストリエントリを残さないクリーンな構成とする。
   - ライセンス同意ステップ等の追加画面も挟まず、手軽にインストールを完了できるようにする。
3. **ビジュアルの統一**:
   - インストーラー実行ファイル自体のアイコンを、アプリ本体と同じ `icons/icon.ico` に統一する。
4. **自動生成と設定完結**:
   - スクリプト（`.nsi` や `.wxs`）を手動作成せず、`tauri.conf.json` の設定のみで自動生成される標準機能を活用する。

---

## 3. インストーラー形式と成果物仕様

Tauri v2 では Windows 向けに **NSIS (`.exe`)** と **WiX (`.msi`)** の 2 種類を生成可能です。

| 項目 | NSIS (`.exe`) 【一般配布向け推奨】 | WiX (`.msi`) 【企業・管理者向け】 |
| :--- | :--- | :--- |
| **形式** | Nullsoft Scriptable Install System | Windows Installer パッケージ |
| **想定用途** | 一般ユーザー向けWeb配布、GitHub Releases | 企業内一括配布、GPO展開 |
| **管理者権限 (UAC)** | **不要（`currentUser`）** | 通常必要 |
| **日本語UI** | 組み込み日本語ファイル（`Japanese.nlf`）による自動日本語化 | `ja-JP`（LCID: 1041）WixUI による日本語化 |
| **出力ファイル名** | `novelaide_<version>_x64-setup.exe` | `novelaide_<version>_x64_ja-JP.msi` |

> [!NOTE]
> WiX (`.msi`) は Tauri の仕様上、言語ロケールコードが付与されたファイル名（`*_ja-JP.msi`）として出力されます。NSIS (`.exe`) はカルチャー表記なしの `novelaide_<version>_x64-setup.exe` として出力されます。

---

## 4. `tauri.conf.json` 設定仕様

`src-tauri/tauri.conf.json` の `"bundle"` 配下に以下を定義します。

```json
{
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "windows": {
      "nsis": {
        "languages": ["Japanese", "English"],
        "displayLanguageSelector": false,
        "installerIcon": "icons/icon.ico"
      },
      "wix": {
        "language": "ja-JP"
      }
    }
  }
}
```

### 各設定項目の解説

1. **`windows.nsis.languages: ["Japanese", "English"]`**:
   - 第1言語に `Japanese` を指定。日本語OSでは自動的に日本語UI（「次へ」「インストール先フォルダー」等）が適用されます。
   - 英語環境のPCでは自動的に `English` にフォールバックします。
2. **`windows.nsis.displayLanguageSelector: false`**:
   - 起動時の「Installer Language」コンボボックスダイアログを非表示にし、OS言語に合わせて直ちにインストーラー本体を開始します。
3. **`windows.nsis.installerIcon: "icons/icon.ico"`**:
   - インストーラー `.exe` 自体のアイコンを、アプリ本体のマルチサイズアイコン（`icons/icon.ico`）に統一します。
4. **`windows.wix.language: "ja-JP"`**:
   - WiX（MSI）インストーラーのダイアログ文言を日本語（LCID: 1041）に設定します。

---

## 5. ビルド手順と出力成果物

### ビルド実行コマンド
```powershell
# 全ターゲット（NSIS および MSI）のビルド
npm run tauri build

# NSIS インストーラーのみビルド
npm run tauri build -- --bundles nsis

# WiX (MSI) インストーラーのみビルド
npm run tauri build -- --bundles msi
```

### 生成されるファイル
* **NSIS**: `src-tauri/target/release/bundle/nsis/`
  * `novelaide_<version>_x64-setup.exe` : インストーラー実行ファイル
  * `novelaide_<version>_x64-setup.nsis.zip` : 自動アップデータ（Tauri Updater）用
* **WiX**: `src-tauri/target/release/bundle/msi/`
  * `novelaide_<version>_x64_ja-JP.msi` : MSI パッケージ
