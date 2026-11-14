# tauri-plugin-novelaid-mcp

`novelaide` を外部から AI エージェントや開発ツール（Claude Desktop, Cursor, Goose, Cline, etc.）で安全に遠隔操作できるようにするための Model Context Protocol (MCP) サーバープラグインです。

## 特徴

- **標準 MCP SSE トランスポート**: `GET /sse` および `POST /message` による公式 MCP SSE 仕様に準拠。
- **フロントエンド・UI状態の完全連携**: 外部からのツール呼び出し（ファイル読み書き、校正、ルビ抽出、メタデータ検索）をフロントエンドへ中継し、エディターの未保存バッファを最優先で安全に参照・更新。
- **二層の権限ガード（Read / Write）**: 設定により読み込み専用（`ReadOnly`）と読み書き可能（`ReadWrite`）を切り替え可能。Rust層とフロントエンド層の両方で強力にガード。
- **内蔵 AI チャットとの統一**: 内蔵 Pi SDK と外部 MCP で同一のツール定義スキーマ（`NOVELAID_TOOLS`）およびディスパッチャーを共有。

## 提供ツール一覧

| ツール名 | 権限 | 説明 |
| :--- | :--- | :--- |
| `read_file` | Read | ファイル内容を取得（未保存バッファがあれば優先） |
| `list_files` | Read | 指定ディレクトリ配下のファイル一覧を取得 |
| `scan_proofread` | Read | Lindera形態素解析による日本語文章校正を実行 |
| `extract_ruby` | Read | 青空文庫形式ルビの抽出・解析を実行 |
| `search_metadata` | Read | 人名・地名・組織等のメタデータを前方一致検索 |
| `write_file` | Write | ファイルの新規作成・上書き保存（エディターバッファ同期） |
| `edit_file` | Write | ファイルの部分置換（エディターバッファ同期） |

## ドキュメント

- [MCP外部制御仕様書](./docs/MCP外部制御仕様書.md)
