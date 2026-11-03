# DocumentType::Codeおよび設定ファイル編集仕様

## 1. 概要

本仕様書は、`novelaide` において `.gitignore` や `.novelaidattributes` などのエディター・システム設定ファイル、および JSON、CSS、YAML、TOML、シェルスクリプト等のコード・設定ファイルを Monaco Editor で汎用的に編集・保存可能とするための **`DocumentType::Code`** の仕様、ならびにドキュメントの拡張子情報の一元管理仕様を定義するものです。

---

## 2. 背景と設計方針

### 2.1 小説エディターにおけるファイル種別と責務分離
- 本エディターにおいて、拡張子 `.txt` は小説本文（`novel`）として扱われ、縦書き文庫プレビューや小説ルビ処理、校正機能の対象となります。
- そのため、汎用テキスト・設定ファイルを扱うための新タイプとして `text` を追加すると「`.txt` は `text` か `novel` か」という責務の重複や混乱が生じます。
- そこで、新種別として **`code`** を導入し、小説執筆（`novel` / `markdown`）と設定・スクリプト編集（`code`）の境界を明快に分離します。

### 2.2 拡張子情報（`extension`）の一元化
従来はフロントエンドの各コンポーネント（`fileService`, `ImagePreview`, `CodeEditor`, `UnsupportedFileView`）で `path.split(/[/\\]/).pop().split('.').pop()` 等の拡張子抽出ロジックが重複して散在していました。
これを一元化し、バックエンドからフロントエンドまで統一された `extension`（小文字化された拡張子文字列）を持たせることで、言語判別やフォーマット処理の保守性を最大化します。

---

## 3. ドキュメント種別（`DocumentType`）一覧

| DocumentType | 主な対象ファイル | サポートViewMode | Monaco言語ID | 主な特徴・制限 |
| :--- | :--- | :--- | :--- | :--- |
| **`novel`** | `.txt`, 小説フォルダ内 `.md` | `editor`, `preview`, `reader` | `novel` (独自構文) | 縦書きプレビュー、ルビ記法、校正、エピソードナビ |
| **`markdown`** | 設定・資料フォルダ内 `.md` | `editor`, `preview`, `reader` | `markdown` | 拡張Markdown描画（図表・レーダー・地図等） |
| **`code` (新設)** | `.gitignore`, `.novelaidattributes`, `.json`, `.yaml`, `.yml`, `.css`, `.toml`, `.js`, `.ts`, `.sh`, `.bat` 等 | **`editor` のみ** | **拡張子から自動解決**<br>(`json`, `yaml`, `css`, `shell`, `ini` 等) | **シンタックスハイライト、コード補完、インデント整形** |
| **`image`** | `.png`, `.jpg`, `.jpeg`, `.svg`, `.webp` 等 | `preview` のみ | なし | ズーム＆パン操作専用（編集不可） |
| **`chat`** | `.chat`, `.ch` | `editor`, `canvas` | `markdown` / AI | AIチャット対話ログ |
| **`unknown`** | `.zip`, `.pdf`, `.exe` 等のバイナリ | なし (非対応) | なし | 非対応案内画面 (`UnsupportedFileView`) |

---

## 4. 詳細仕様

### 4.1 拡張子判定と判定優先順位
ドキュメント種別の判定は以下の優先順位で行います。

1. **`.novelaidattributes` ルール照合（最優先）**:
   - ディレクトリ直下または親ディレクトリの `.novelaidattributes` を確認し、パターン（例: `*.custom novel`, `.gitignore code`）に合致した場合は指定された `DocumentType` を適用。
2. **ドットファイル名による明示判定**:
   - 拡張子を持たない、またはファイル名全体がドットで始まる以下の設定ファイルは `code` として判定：
     - `.gitignore`, `.gitattributes`, `.novelaidattributes`, `.editorconfig`, `.prettierrc`, `.env` 等
3. **拡張子による標準判定**:
   - `code`: `json`, `yaml`, `yml`, `toml`, `css`, `scss`, `less`, `js`, `mjs`, `cjs`, `ts`, `tsx`, `jsx`, `html`, `xml`, `sh`, `bash`, `bat`, `cmd`, `ps1`, `sql`, `ini`, `conf`
   - `novel`: `txt`
   - `image`: `png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`, `bmp`, `ico`, `tiff`
   - `chat`: `chat`, `ch`
   - `markdown`: `md`, `markdown`
4. **フォールバック**:
   - 上記に該当しないバイナリまたは未知の形式は `unknown`。

### 4.2 拡張子情報（`extension`）の構造と定義

#### ① Rust バックエンド（`tauri-plugin-novelaid-fs`）
`NovelaidDocument` および `NovelaidDirEntry` に `extension` フィールドを追加：
```rust
pub struct NovelaidDirEntry {
    pub name: String,
    pub path: String,
    pub base_name: String,
    pub file_title: String,
    pub extension: String, // 小文字化された拡張子（ドットなし、例: "json", "gitignore"）
    pub is_directory: bool,
    pub document_type: NovelaidDocumentType,
    pub children: Option<Vec<NovelaidDirEntry>>,
}

pub struct NovelaidDocument {
    pub path: String,
    pub base_name: String,
    pub file_title: String,
    pub extension: String,
    pub content: String,
    pub metadata: serde_json::Value,
    pub document_type: NovelaidDocumentType,
    pub mtime_ms: u64,
}
```

#### ② フロントエンド（`src/types/document.ts`）
`DocumentState` に `extension: string` を追加：
```typescript
export interface DocumentState {
  path: string;
  baseName: string;
  fileTitle: string;
  extension: string; // 一元化された拡張子
  content: string;
  metadata: Record<string, any>;
  documentType: NovelaidDocumentType;
  isDirty: boolean;
  mtime?: number;
  lastSavedLength?: number;
  views: DocumentViewRef[];
  leftViewMode?: DocumentViewMode;
  rightViewMode?: DocumentViewMode;
}
```

### 4.3 Monaco Editor 言語（Language ID）の動的自動解決
`CodeEditor.tsx` において、`documentType === 'code'` の場合は `extension` に基づいて Monaco Editor の言語 ID を動的に設定します。

| 拡張子（`extension`） | Monaco言語ID |
| :--- | :--- |
| `json` | `json` |
| `css`, `scss`, `less` | `css` |
| `yaml`, `yml` | `yaml` |
| `toml`, `ini`, `novelaidattributes`, `env`, `conf` | `ini` |
| `gitignore`, `gitattributes`, `sh`, `bash` | `shell` |
| `bat`, `cmd` | `bat` |
| `js`, `mjs`, `cjs`, `jsx` | `javascript` |
| `ts`, `tsx` | `typescript` |
| `html`, `xml`, `svg` | `html` / `xml` |
| `sql` | `sql` |
| その他 | `plaintext` |

### 4.4 生テキスト（RAW text）保存の保証
- `code` ファイル（`.gitignore`, `.json`, `.css` 等）は YAML Frontmatter を持たない形式です。
- `desktop.rs` の `read_document` および `write_document` において、`document_type == NovelaidDocumentType::Code` の場合は Frontmatter の抽出・付加を行わず、純粋な生テキストとして保存・読込を行い、ファイル破損を防止します。

### 4.5 UI・エディター表示制御
- **アイコン表示**: `DocumentIcon` において `code` は `<FileCode style={{ color: "#f59e0b" }} />` を表示。
- **タブ操作制御**: `code` ドキュメントではモード切替ボタン（`[Preview]` 等）を表示せず、エディター専用タブとしてクリーンに表示。
- **校正除外**: 小説専用の形態素解析・ルビ校正マーカーは `code` ドキュメントでは動作させない。
