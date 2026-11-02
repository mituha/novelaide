# DocumentTypeと各種ビューおよび画像プレビュー仕様

## 1. 概要

本仕様書は、`novelaide` におけるファイル形式（`DocumentType`）の分類、各種ビュープラグインの構成、非対応ファイルへの安全なフォールバック処理、および新規追加された画像プレビュー（ImageView）の動作仕様を定義するものです。

---

## 2. DocumentType 分類とビュープラグイン構成

### 2.1 ドキュメント種別とビュー対応一覧

| DocumentType | 該当拡張子 | サポートするViewMode | 初期ViewMode | 担当ビュープラグイン | 特徴・制限 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`novel`** | `.txt`, 小説フォルダ内 `.md` | `editor`, `preview`, `reader` | `editor` | `TextEditorPlugin`, `NovelPreviewPlugin`, `NovelReaderPlugin` | 縦書き文庫プレビュー、ルビ校正、エピソード移動 |
| **`markdown`** | 設定・資料フォルダ内 `.md` | `editor`, `preview`, `reader` | `editor` | `TextEditorPlugin`, `MarkdownPreviewPlugin`, `MarkdownReaderPlugin` | 拡張Markdown描画（レーダー、マップ等） |
| **`css`** | `.css` | `editor` | `editor` | `TextEditorPlugin` | CSSシンタックスハイライト |
| **`image`** | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.bmp`, `.ico` | **`preview` のみ** | **`preview`** | **`ImagePreviewPlugin`** | **ズーム & パン移動対応、編集非サポート** |
| **`chat`** | `.chat`, `.ch` | `editor`, `canvas` | `canvas` | `TextEditorPlugin`, `AiPanelPlugin` | AIチャット対話ログ |
| **`unknown`** | 未知の拡張子、バイナリ等 | **なし (非対応)** | `none` | **`UnsupportedFileView`** | **非対応案内画面の表示のみ** |

---

## 3. 非対応ファイル（`unknown`）の安全処理

### 3.1 従来の課題と根本原因
- 従来の `read_document`（Rust）は全ファイルを `std::fs::read_to_string` で読もうとしており、バイナリや未対応形式でUTF-8エラーを返していた。
- フロントエンドの `fileService.readFile` はエラー発生時、ブラウザ開発用モックの「`01_プロローグ.md`」を返していたため、タブ名が「01_プロローグ」に化け、クリックするたびにタブが際限なく増殖していた。

### 3.2 改善後のアーキテクチャ
- **Rustバックエンド（`tauri-plugin-novelaid-fs`）**:
  - `document_type` を先行判定し、`Image` はテキスト読み込みをスキップして空本文で正常返却。
  - `read_to_string` が失敗するバイナリファイル等も、エラーではなく `document_type: NovelaidDocumentType::Unknown`, `content: ""` で安全に返却。
- **フロントエンド（`fileService.ts`）**:
  - `catch` 節での固定モック返却を完全撤廃。指定されたパスから正確な `baseName` と `fileTitle` を算出し、`documentType: "unknown"` を返却。
- **ビュー（`DocumentPane.tsx` / `UnsupportedFileView.tsx`）**:
  - プラグインが存在しない場合および `unknown` の場合、専用の案内画面（`UnsupportedFileView`）を表示。
  - タブには本来のファイル名（例: `backup.zip`）が表示され、重複クリック時は同一タブがアクティブ化される。

---

## 4. 画像プレビュー（ImageView / `ImagePreview`）仕様

### 4.1 画像の読み込み方式（Asset Protocol + 二段構えBlobフォールバック）
- **プライマリ読み込み（Tauri 2 Asset Protocol）**:
  - `convertFileSrc(path)` を使用。
  - `src-tauri/tauri.conf.json` の `app.security.assetProtocol`（`enable: true`, `scope: ["**"]`）および `src-tauri/Cargo.toml` の `tauri` feature `protocol-asset` を有効化。
  - ローカル画像ファイルをBase64文字列に変換することなく、カスタムプロトコル（`asset://`）経由で直接・高速にレンダリング。
- **セカンダリ読み込み（バイナリBlob URLフォールバック）**:
  - プラグイン `tauri-plugin-novelaid-fs` に `read_file_binary(path)` を追加。
  - Windows WebView2 やパス形式（日本語・特殊記号など）に起因して `convertFileSrc` による画像ロードが失敗（`onError`）した場合、即座に Rust 側からバイナリを取得して `URL.createObjectURL(blob)` を生成し差し替える。
  - これにより、どのようなOS環境やフォルダ構成であっても画像が確実に表示される堅牢性を担保。
  - コンポーネント破棄時には `URL.revokeObjectURL` で安全にメモリ解放。

### 4.2 操作機能
1. **マウスホイールズーム**:
   - ホイール回転（`deltaY`）により 0.1倍（10%）〜 10倍（1000%）の範囲で拡大・縮小。
2. **マウスドラッグによるパン（スクロール）**:
   - マウス左ドラッグで画像キャンバスを自由移動。カーソルは `grab` / `grabbing`。
3. **下部フローティングツールバー**:
   - 拡大（Zoom In）、縮小（Zoom Out）、現在の倍率パーセント表示（クリックで100%リセット）。
   - 「全体表示（Fit）」ボタン（ウィンドウ枠に収まる最適倍率に自動調整）。
   - 「リセット」ボタン（原寸100%かつ中央位置にリセット）。
4. **透過画像対応チェッカーボード背景**:
   - 背景にCSSグラデーションによる微細なグリッドパターンを敷き、透過PNGや透過SVGの輪郭を視認可能化。
5. **編集非サポート**:
   - 画像ファイルは `preview` モード専用。Monacoエディタへの切替ボタン等は非表示。
